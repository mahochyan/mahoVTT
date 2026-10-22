"""Generate one original Graveyard Shift cover with Qwen-Image-2.1 (local, 4-bit)."""
import os, time
import torch
from PIL import Image

MODEL = os.environ.get("QWEN_IMAGE_MODEL", r"E:/AIprogram/models/Qwen-Image-2.1")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "wg-cover.png")
W, H, STEPS = 1024, 576, 24

PROMPT = (
    "Warhammer 40,000 gothic cemetery moon, torrential monsoon rain, enormous crumbling "
    "mausoleums and a bone-lined avenue, three robed Inquisitorial agents carrying amber lanterns, "
    "long coats, a distant spire bearing a double-headed eagle, teal-grey storm palette, "
    "amber lantern glow, cinematic wide establishing shot, painterly tabletop RPG concept art, "
    "high detail, no text, no letters, no numbers, no logos, no user interface."
)
NEG = "text, letters, numbers, watermark, logo, user interface, bright sunny day, modern city, cartoon"

def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    from diffusers import PipelineQuantizationConfig, QwenImage21Pipeline
    quant = PipelineQuantizationConfig(
        quant_backend="bitsandbytes_4bit",
        quant_kwargs={"load_in_4bit": True, "bnb_4bit_quant_type": "nf4", "bnb_4bit_use_double_quant": True},
        components_to_quantize=["transformer", "text_encoder"],
    )
    t0 = time.time()
    pipe = QwenImage21Pipeline.from_pretrained(MODEL, torch_dtype=torch.bfloat16, quantization_config=quant, low_cpu_mem_usage=True)
    pipe.enable_model_cpu_offload()
    print(f"loaded in {time.time()-t0:.1f}s", flush=True)
    t1 = time.time()
    image = pipe(
        prompt=PROMPT,
        negative_prompt=NEG,
        width=W,
        height=H,
        num_inference_steps=STEPS,
        generator=torch.Generator("cpu").manual_seed(240724),
    ).images[0]
    image.save(OUT)
    print(f"generated in {time.time()-t1:.1f}s -> {OUT}", flush=True)

if __name__ == "__main__":
    main()
