"""Generate three visual directions + one RGBA portrait test with Qwen-Image-2.1.

Batch loads the pipeline once, then produces:
  out/concepts/A_dark_brass_hero.png
  out/concepts/A_dark_brass_mood.png
  ... B, C ...
  out/concepts/rgba_portrait.png
  out/concepts/contact_sheet.png
  out/concepts/report.json
"""
import json
import os
import time

import torch
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "concepts")
MODEL = os.environ.get("QWEN_IMAGE_MODEL", "models/Qwen-Image-2.1")
W, H = 768, 432
STEPS = int(os.environ.get("CONCEPT_STEPS", "22"))

STYLE = (
    "Painterly dark-fantasy tabletop RPG illustration, cinematic candlelight, "
    "deep navy and teal shadows, warm brass and ember highlights, aged parchment, "
    "carved stone and oxidized copper, volumetric dust, shallow depth of field, "
    "high detail, concept art quality. No text, no letters, no numbers, no watermark, "
    "no user interface, no logos."
)

DIRECTIONS = {
    "A_dark_brass": {
        "label": "A DARK BRASS",
        "seed": 1101,
        "hero": "Top-down view of an adventurer's table inside a ruined bell tower: an aged parchment map weighted by a brass compass and a burning candle, scattered copper keys, a cracked lantern, a closed leather journal, deep navy shadows with warm candle glow.",
        "mood": "A stone dungeon floor seen from a low angle, wet flagstones, brass fittings, dark teal mist, a distant candle flame, no characters.",
    },
    "B_warm_tavern": {
        "label": "B WARM TAVERN",
        "seed": 1102,
        "hero": "Overhead view of a warm tavern table: oak planks, pewter mugs, carved dice, a hand-drawn regional map, candlelight and hearth embers, a leather-bound book, cozy amber palette.",
        "mood": "A quiet tavern interior at night, rain on the windows, warm hearth light, wooden beams, an empty table with a map and mugs, no people.",
    },
    "C_ash_minimal": {
        "label": "C ASH MINIMAL",
        "seed": 1103,
        "hero": "Minimal ash-grey tabletop with a single parchment map, charcoal dust, one dying candle, cold fog, restrained palette of graphite and pale ember, high contrast, generous negative space.",
        "mood": "An ash-covered stone hall with thin fog and a single ember light, monochrome charcoal with a faint warm accent, cinematic minimal environment art, no characters.",
    },
}

RGBA_PROMPT = (
    "This is an RGBA image with transparency. A bust portrait of a weathered human fighter "
    "in a dark-fantasy world, short dark hair, a scar over one brow, worn leather and chainmail, "
    "a brass cloak pin, painted in warm candlelight. The image has an alpha channel and the "
    "background is fully transparent. No text, no watermark."
)


def load_pipe():
    from diffusers import PipelineQuantizationConfig, QwenImage21Pipeline

    quant = PipelineQuantizationConfig(
        quant_backend="bitsandbytes_4bit",
        quant_kwargs={
            "load_in_4bit": True,
            "bnb_4bit_quant_type": "nf4",
            "bnb_4bit_use_double_quant": True,
        },
        components_to_quantize=["transformer", "text_encoder"],
    )
    pipe = QwenImage21Pipeline.from_pretrained(
        MODEL,
        torch_dtype=torch.bfloat16,
        quantization_config=quant,
        low_cpu_mem_usage=True,
    )
    pipe.enable_model_cpu_offload()
    return pipe


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    t0 = time.time()
    pipe = load_pipe()
    load_s = time.time() - t0
    print(f"[concepts] loaded in {load_s:.1f}s", flush=True)

    report = {"model": MODEL, "quant": "bitsandbytes_4bit", "load_seconds": round(load_s, 1), "items": []}
    for key, d in DIRECTIONS.items():
        for kind in ("hero", "mood"):
            prompt = d[kind] + " " + STYLE
            t = time.time()
            image = pipe(
                prompt=prompt,
                width=W,
                height=H,
                num_inference_steps=STEPS,
                generator=torch.Generator("cpu").manual_seed(d["seed"] + (0 if kind == "hero" else 1)),
            ).images[0]
            path = os.path.join(OUT, f"{key}_{kind}.png")
            image.save(path)
            secs = time.time() - t
            report["items"].append({"id": f"{key}_{kind}", "path": path, "seconds": round(secs, 1), "seed": d["seed"] + (0 if kind == "hero" else 1)})
            print(f"[concepts] {key}/{kind} {secs:.1f}s -> {path}", flush=True)

    t = time.time()
    rgba = pipe(
        prompt=RGBA_PROMPT,
        width=512,
        height=512,
        num_inference_steps=STEPS,
        generator=torch.Generator("cpu").manual_seed(1201),
    ).images[0]
    rgba_path = os.path.join(OUT, "rgba_portrait.png")
    rgba.save(rgba_path)
    alpha = rgba.getchannel("A") if rgba.mode == "RGBA" else None
    report["rgba"] = {
        "path": rgba_path,
        "mode": rgba.mode,
        "seconds": round(time.time() - t, 1),
        "alpha_min": alpha.getextrema()[0] if alpha else None,
        "alpha_max": alpha.getextrema()[1] if alpha else None,
    }
    print(f"[concepts] rgba mode={rgba.mode} alpha={report['rgba']['alpha_min']}..{report['rgba']['alpha_max']}", flush=True)

    # Contact sheet: 3 rows x 2 columns, with English labels (avoid CJK font issues).
    pad, label_h = 18, 34
    cell_w, cell_h = W // 2, H // 2
    sheet = Image.new("RGB", (cell_w * 2 + pad * 3, (cell_h + label_h) * 3 + pad * 2), "#0b1016")
    draw = ImageDraw.Draw(sheet)
    for row, (key, d) in enumerate(DIRECTIONS.items()):
        for col, kind in enumerate(("hero", "mood")):
            img = Image.open(os.path.join(OUT, f"{key}_{kind}.png")).convert("RGB").resize((cell_w, cell_h), Image.LANCZOS)
            x = pad + col * (cell_w + pad)
            y = pad + row * (cell_h + label_h + pad)
            sheet.paste(img, (x, y))
            draw.text((x + 6, y + cell_h + 8), f"{d['label']} / {kind.upper()}", fill="#c9b28a")
    sheet_path = os.path.join(OUT, "contact_sheet.png")
    sheet.save(sheet_path)
    report["contact_sheet"] = sheet_path

    with open(os.path.join(OUT, "report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    print("[concepts] " + json.dumps(report, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    import sys

    try:
        sys.exit(main())
    except Exception:
        import traceback

        traceback.print_exc()
        print("[concepts] FAILED", flush=True)
        raise
