"""
Background removal Space using BRIA RMBG-2.0 (state-of-the-art BiRefNet-based model).

Deploy to: https://huggingface.co/spaces/easyposterke/remove_bg

Steps:
  1. Go to your Space → Files → upload these files (app.py + requirements.txt)
     OR use `git clone` + push.
  2. In the Space Settings, set SDK to "Gradio" and Hardware to "ZeroGPU" (free)
     or "T4 small" (paid but always warm).
  3. Wait for the build to complete.

The /remove_background endpoint is compatible with the existing frontend code.
"""

import os
import gradio as gr
import spaces
from transformers import AutoModelForImageSegmentation
import torch
from torchvision import transforms
from PIL import Image
import io

torch.set_float32_matmul_precision("high")

model = AutoModelForImageSegmentation.from_pretrained(
    "briaai/RMBG-2.0", trust_remote_code=True
)
model.to("cuda")

transform_image = transforms.Compose([
    transforms.Resize((1024, 1024)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

output_folder = "output_images"
os.makedirs(output_folder, exist_ok=True)


@spaces.GPU
def remove_background(input_image):
    """Accept an image, return a PNG with the background removed."""
    if input_image is None:
        raise gr.Error("No image provided")

    if isinstance(input_image, str):
        from loadimg import load_img
        im = load_img(input_image, output_type="pil")
    elif isinstance(input_image, Image.Image):
        im = input_image
    else:
        im = Image.open(io.BytesIO(input_image))

    im = im.convert("RGB")
    original_size = im.size

    input_tensor = transform_image(im).unsqueeze(0).to("cuda")
    with torch.no_grad():
        preds = model(input_tensor)[-1].sigmoid().cpu()

    pred = preds[0].squeeze()
    mask = transforms.ToPILImage()(pred).resize(original_size)
    im.putalpha(mask)

    out_path = os.path.join(output_folder, "no_bg_image.png")
    im.save(out_path, "PNG")
    return out_path


demo = gr.Interface(
    fn=remove_background,
    inputs=gr.Image(label="Upload an image", type="pil"),
    outputs=gr.Image(label="Background removed", type="filepath"),
    title="Background Removal (RMBG 2.0)",
    description="Upload an image to remove its background using BRIA RMBG-2.0.",
    api_name="remove_background",
)

if __name__ == "__main__":
    demo.launch(show_error=True)
