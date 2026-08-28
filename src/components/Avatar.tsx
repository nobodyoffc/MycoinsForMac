import {avatarImageUrl} from './avatar-images';

// Base58 character to index mapping (same as AvatarMaker.java)
const CHAR_MAP: Record<string, number> = {
  '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8,
  'A': 9, 'B': 10, 'C': 11, 'D': 12, 'E': 13, 'F': 14, 'G': 15, 'H': 16,
  'J': 17, 'K': 18, 'L': 19, 'M': 20, 'N': 21, 'P': 22, 'Q': 23, 'R': 24,
  'S': 25, 'T': 26, 'U': 27, 'V': 28, 'W': 29, 'X': 30, 'Y': 31, 'Z': 32,
  'a': 33, 'b': 34, 'c': 35, 'd': 36, 'e': 37, 'f': 38, 'g': 39, 'h': 40,
  'i': 41, 'j': 42, 'k': 43, 'm': 44, 'n': 45, 'o': 46, 'p': 47, 'q': 48,
  'r': 49, 's': 50, 't': 51, 'u': 52, 'v': 53, 'w': 54, 'x': 55, 'y': 56,
  'z': 57,
};

function getLayerKeys(address: string): string[] {
  if (address.length !== 34) return [];
  const keys: string[] = [];
  for (let i = 0; i < 10; i++) {
    const charPos = 33 - 4 - i;
    const c = address[charPos];
    const idx = CHAR_MAP[c];
    if (idx === undefined) return [];
    keys.push(`${i}_${idx}`);
  }
  return keys;
}

interface AvatarProps {
  address: string;
  size?: number;
}

export function Avatar({address, size = 40}: AvatarProps) {
  const layerKeys = getLayerKeys(address);
  if (layerKeys.length !== 10) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: '#ccc',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        flexShrink: 0,
      }}>
      {layerKeys.map((key, i) => {
        const url = avatarImageUrl(key);
        if (!url) return null;
        return (
          <img
            key={i}
            src={url}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: size,
              height: size,
              objectFit: 'contain',
              pointerEvents: 'none',
            }}
          />
        );
      })}
    </div>
  );
}
