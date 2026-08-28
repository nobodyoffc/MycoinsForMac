// Avatar layer images are served from public/avatar-elements/<layer>/<idx>.png
// Key format: `{layer}_{idx}` (matches AvatarMaker.java indexing).
export function avatarImageUrl(key: string): string | null {
  const [layer, idx] = key.split('_');
  if (!layer || !idx) return null;
  return `/avatar-elements/${layer}/${idx}.png`;
}
