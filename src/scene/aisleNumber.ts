import * as T from "three";

/** A camera-facing sign that remains readable from either end of an aisle. */
export function aisleNumber(number: number, x: number, y: number, z: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#163b60";
  ctx.roundRect(4, 4, 504, 152, 24);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 72px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Aisle ${number}`, 256, 80);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const material = new T.SpriteMaterial({
    map: texture,
    depthWrite: false,
    sizeAttenuation: false,
  });
  const sprite = new T.Sprite(material);
  sprite.name = `Floating aisle ${number}`;
  sprite.position.set(x, y, z);
  sprite.scale.set(0.09, 0.028, 1);
  return { sprite, texture, material };
}
