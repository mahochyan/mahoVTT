"""Generate circular-token portraits for the bundled world with Qwen-Image-2.1.

Square 512px bust portraits on a dark neutral background; the UI crops them
into circles, so no alpha channel is required.
"""
import json
import os
import time

import torch
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "tokens")
MODEL = os.environ.get("QWEN_IMAGE_MODEL", "models/Qwen-Image-2.1")
STEPS = int(os.environ.get("TOKEN_STEPS", "24"))
SIZE = 512

STYLE = (
    "Painterly dark-fantasy character bust portrait, centered, head and shoulders, "
    "square composition, facing the viewer, warm candlelight from one side with a cool rim light, "
    "dark neutral stone background, muted navy and brass palette, high detail, concept art, "
    "no text, no letters, no watermark, no frame, no border."
)

SUBJECTS = {
    "pc_fighter": "A weathered human fighter with short dark hair, a scar over one brow, worn chainmail and leather, a brass cloak pin, resolute expression.",
    "pc_ranger": "A human ranger with a dark green hood pushed back, a bowstring over the shoulder, leather bracers, sharp watchful eyes.",
    "pc_cleric": "A human cleric with short grey hair, a brass sun medallion, pale vestments under a dark cloak, calm stern face.",
    "shen_yuan": "A young woman ranger with a long dark braid, a hood, a short bow over her shoulder, weathered leather, cool teal moonlight in her eyes.",
    "luo_en": "A middle-aged man priest with a short beard, a brass sun medallion, a dark blue robe with gold trim, warm and steady expression.",
    "goblin_melee": "A grey-green goblin raider with jagged teeth, a rusted iron helmet, crude leather straps, torchlight, snarling.",
    "goblin_archer": "A grey-green goblin archer with a tattered hood, yellow eyes, a short bow, crude leather armor, dim torchlight.",
    "guardian": "An ancient brass-and-stone construct guardian, no human face, glowing blue runes in its chest, cracked metal and carved stone.",
    "ileya": "A woman lampkeeper with dark hair, a grey cloak, holding a brass lantern, warm candlelight on her face, tired but kind.",
    "migu": "A small goblin porter with worried eyes, a rope sack strap across the chest, dirty cloth, warm lantern light.",
}


def load_pipe():
    from diffusers import PipelineQuantizationConfig, QwenImage21Pipeline

    quant = PipelineQuantizationConfig(
        quant_backend="bitsandbytes_4bit",
        quant_kwargs={"load_in_4bit": True, "bnb_4bit_quant_type": "nf4", "bnb_4bit_use_double_quant": True},
        components_to_quantize=["transformer", "text_encoder"],
    )
    pipe = QwenImage21Pipeline.from_pretrained(MODEL, torch_dtype=torch.bfloat16, quantization_config=quant, low_cpu_mem_usage=True)
    pipe.enable_model_cpu_offload()
    return pipe


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    t0 = time.time()
    pipe = load_pipe()
    report = {"model": MODEL, "quant": "bitsandbytes_4bit", "size": SIZE, "steps": STEPS, "load_seconds": round(time.time() - t0, 1), "items": []}
    print(f"[tokens] loaded in {report['load_seconds']}s", flush=True)
    for i, (key, subject) in enumerate(SUBJECTS.items()):
        seed = 2100 + i
        t = time.time()
        image = pipe(prompt=subject + " " + STYLE, width=SIZE, height=SIZE, num_inference_steps=STEPS,
                     generator=torch.Generator("cpu").manual_seed(seed)).images[0]
        path = os.path.join(OUT, key + ".png")
        image.save(path)
        report["items"].append({"id": key, "seed": seed, "path": path, "seconds": round(time.time() - t, 1)})
        print(f"[tokens] {key} {report['items'][-1]['seconds']}s", flush=True)

    # contact sheet 5 columns
    cell, pad, label = 240, 10, 22
    cols = 5
    rows = (len(SUBJECTS) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cell + pad) + pad, rows * (cell + label + pad) + pad), "#0b1016")
    draw = ImageDraw.Draw(sheet)
    for i, (key, _) in enumerate(SUBJECTS.items()):
        img = Image.open(os.path.join(OUT, key + ".png")).convert("RGB").resize((cell, cell), Image.LANCZOS)
        x = pad + (i % cols) * (cell + pad)
        y = pad + (i // cols) * (cell + label + pad)
        sheet.paste(img, (x, y))
        draw.text((x + 4, y + cell + 4), key, fill="#c9b28a")
    sheet.save(os.path.join(OUT, "contact_sheet.png"))
    with open(os.path.join(OUT, "report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    print("[tokens] done", flush=True)
    return 0


if __name__ == "__main__":
    import sys
    try:
        sys.exit(main())
    except Exception:
        import traceback
        traceback.print_exc()
        print("[tokens] FAILED", flush=True)
        raise
