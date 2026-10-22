"""Qwen-Image-2.1 本地可行性冒烟：4-bit 量化 + 512px 单图。

用途：验证 RTX 4070S 12GB / 32GB RAM 上能否加载并生成。
不修改项目运行时，只写 tools/art/out/。
"""
import json
import os
import sys
import time

import torch

MODEL = os.environ.get("QWEN_IMAGE_MODEL", "models/Qwen-Image-2.1")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "smoke.png")
PROMPT = os.environ.get(
    "SMOKE_PROMPT",
    "A dark fantasy tavern table seen from above, candlelight, parchment map, "
    "brass dice, carved stone walls, warm ember glow against deep navy shadows, "
    "painterly tabletop RPG illustration, no text",
)
WIDTH = int(os.environ.get("SMOKE_WIDTH", "512"))
HEIGHT = int(os.environ.get("SMOKE_HEIGHT", "512"))
STEPS = int(os.environ.get("SMOKE_STEPS", "6"))
SEED = int(os.environ.get("SMOKE_SEED", "42"))


def main() -> int:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

    from diffusers import PipelineQuantizationConfig, QwenImage21Pipeline

    t0 = time.time()
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
    load_s = time.time() - t0
    print(f"[smoke] loaded in {load_s:.1f}s", flush=True)

    pipe.enable_model_cpu_offload()
    print("[smoke] cpu offload enabled", flush=True)

    t1 = time.time()
    image = pipe(
        prompt=PROMPT,
        width=WIDTH,
        height=HEIGHT,
        num_inference_steps=STEPS,
        generator=torch.Generator("cpu").manual_seed(SEED),
    ).images[0]
    gen_s = time.time() - t1
    image.save(OUT)
    report = {
        "ok": True,
        "model": MODEL,
        "quant": "bitsandbytes_4bit",
        "width": WIDTH,
        "height": HEIGHT,
        "steps": STEPS,
        "seed": SEED,
        "load_seconds": round(load_s, 1),
        "generate_seconds": round(gen_s, 1),
        "vram_peak_gb": round(torch.cuda.max_memory_allocated() / 1024**3, 2),
        "output": OUT,
    }
    print("[smoke] " + json.dumps(report, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        import traceback

        traceback.print_exc()
        print("[smoke] FAILED:", type(exc).__name__, str(exc)[:400], flush=True)
        sys.exit(1)
