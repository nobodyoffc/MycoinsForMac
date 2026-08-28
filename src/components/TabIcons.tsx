interface IconProps {
  size?: number;
  color?: string;
}

// Google Material Icon: payments
export function CoinsIcon({size = 24, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
      <path d="M540-420q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35ZM220-280q-24.75 0-42.37-17.63Q160-315.25 160-340v-400q0-24.75 17.63-42.38Q195.25-800 220-800h640q24.75 0 42.38 17.62Q920-764.75 920-740v400q0 24.75-17.62 42.37Q884.75-280 860-280H220Zm100-60h440q0-42 29-71t71-29v-200q-42 0-71-29t-29-71H320q0 42-29 71t-71 29v200q42 0 71 29t29 71Zm480 180H100q-24.75 0-42.37-17.63Q40-195.25 40-220v-460h60v460h700v60ZM220-340v-400 400Z" />
    </svg>
  );
}

// Google Material Icon: key
export function KeysIcon({size = 24, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
      <path d="M232-432q-20-20-20-48t20-48q20-20 48-20t48 20q20 20 20 48t-20 48q-20 20-48 20t-48-20Zm48 192q-100 0-170-70T40-480q0-100 70-170t170-70q72 0 126 34t85 103h356l113 113-167 153-88-64-88 64-75-60h-51q-25 60-78.5 98.5T280-240Zm0-60q58 0 107-38.5t63-98.5h114l54 45 88-63 82 62 85-79-51-51H450q-12-56-60-96.5T280-660q-75 0-127.5 52.5T100-480q0 75 52.5 127.5T280-300Z" />
    </svg>
  );
}

// Google Material Icon: swap_horiz
export function SwapIcon({size = 24, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
      <path d="M280-160 80-360l200-200 56 57-103 103h527v80H233l103 103-56 57Zm400-240-56-57 103-103H200v-80h527L624-743l56-57 200 200-200 200Z" />
    </svg>
  );
}

// Google Material Icon: settings
export function SettingsIcon({size = 24, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
      <path d="m388-80-20-126q-19-7-40-19t-37-25l-118 54-93-164 108-79q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521L80-600l93-164 118 54q16-13 37-25t40-18l20-127h184l20 126q19 7 40.5 18.5T669-710l118-54 93 164-108 77q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l108 78-93 164-118-54q-16 13-36.5 25.5T592-206L572-80H388Zm48-60h88l14-112q33-8 62.5-25t53.5-41l106 46 40-72-94-69q4-17 6.5-33.5T715-480q0-17-2-33.5t-7-33.5l94-69-40-72-106 46q-23-26-52-43.5T538-708l-14-112h-88l-14 112q-34 7-63.5 24T306-642l-106-46-40 72 94 69q-4 17-6.5 33.5T245-480q0 17 2.5 33.5T254-413l-94 69 40 72 106-46q24 24 53.5 41t62.5 25l14 112Zm44-210q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Zm0-130Z" />
    </svg>
  );
}
