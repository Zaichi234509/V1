# Source plates

`hero-char-green.jpg` is the original generated character plate on a chroma-green
background. It is **not** shipped — it is kept only as provenance for the keyed
cutout at `public/img/hero-char.png`.

Keying recipe used (OpenCV):

1. HSV mask: `H ∈ (33, 92)`, `S > 60`, `V > 50`
2. Keep only **border-connected** green components, so green props inside the
   subject survive the key
3. `MORPH_OPEN(3)` then `MORPH_CLOSE(7)`
4. `GaussianBlur σ=1.2`, then remap alpha `clip((a − 0.35) / 0.45, 0, 1)`
5. Despill: clamp G to `1.06 · (R + B) / 2`
6. Crop to the alpha bounding box + 12 px padding

Result: 639×1270, 39.0% opaque. Generating the subject on black and flood-filling
does **not** work — the key leaks through dark hair and clothing.
