import { Color } from "three";

const basic = [
  "#1e242c",
  "#4a5b6b",
  "#8da0b4",
  "#cdd9e6",
  "#f5f8fb",
  "#ebb43a",
  "#e74c3c",
];

const fire = [
  "#FD7555",
  "#FE4F2E",
  "#040720",
  "#EB9786",
  "#E02211",
  "#3A0724",
  "#F9C163",
];

const earth = [
  "#FE695A",
  "#0F2246",
  "#CE451C",
  "#FEF2CD",
  "#EEC1A6",
  "#57424A",
  "#E2902D",
];

const florian = ["#20a0aa", "#ec4039", "#ffae12"];

const acidCool = ["#ffffff", "#4477aa", "#3eb9d6", "#ffcb5c"];

const acidTrip = fix([
  "#baebff",
  "#bbdbfe",
  "#bccbfd",
  "#bebcfc",
  "#bfacfb",
  "#c09cfa",
  "#c18cf9",
  "#c37df8",
  "#c46df7",
  "#c55df6",
]);

function fix(colors) {
  const c = new Color();
  colors.map((v) => {
    c.setStyle(v);
    const res = {};
    c.getHSL(res);
    c.setHSL(res.h, res.s ** 2, res.l ** 2);
    return c.getHex();
  });
  return colors;
}

// https://coolors.co/palettes/trending

const fieryOcean = fix(["#780000", "#c1121f", "#fdf0d5", "#003049", "#669bbc"]);
const fieryPalette = fix([
  "#5f0f40",
  "#9a031e",
  "#fb8b24",
  "#e36414",
  "#0f4c5c",
]);
const oliveGardenFeast = fix([
  "#606c38",
  "#283618",
  "#fefae0",
  "#dda15e",
  "#bc6c25",
]);
const vibrantColorFiesta = fix([
  "#ffbe0b",
  "#fb5607",
  "#ff006e",
  "#8338ec",
  "#3a86ff",
]);
const blackAndGoldElegance = fix([
  "#000000",
  "#14213d",
  "#fca311",
  "#e5e5e5",
  "#ffffff",
]);
const refreshingSummerFun = fix([
  "#8ecae6",
  "#219ebc",
  "#023047",
  "#ffb703",
  "#fb8500",
]);
const warmAutumnGlow = fix([
  "#003049",
  "#d62828",
  "#f77f00",
  "#fcbf49",
  "#eae2b7",
]);
const oceanSunset = fix([
  "#001219",
  "#005f73",
  "#0a9396",
  "#94d2bd",
  "#e9d8a6",
  "#ee9b00",
  "#ca6702",
  "#bb3e03",
  "#ae2012",
  "#9b2226",
]);
const naturesHarmony = fix([
  "#004733",
  "#2b6a4d",
  "#568d66",
  "#a5c1ae",
  "#f3f4f6",
  "#dcdfe5",
  "#df8080",
  "#cb0b0a",
  "#ad080f",
  "#8e0413",
]);
const mysticBliss = fix([
  "#b8b8d1",
  "#5b5f97",
  "#ffc145",
  "#fffffb",
  "#ff6b6c",
]);
const mysticalGlow = fix([
  "#331832",
  "#d81e5b",
  "#f0544f",
  "#c6d8d3",
  "#fdf0d5",
]);
const vibrantNights = fix([
  "#820263",
  "#d90368",
  "#eadeda",
  "#2e294e",
  "#ffd400",
]);
const brightContrasts = fix([
  "#f8ffe5",
  "#06d6a0",
  "#1b9aaa",
  "#ef476f",
  "#ffc43d",
]);
const vibrantSunset = fix([
  "#ff6d00",
  "#ff7900",
  "#ff8500",
  "#ff9100",
  "#ff9e00",
  "#240046",
  "#3c096c",
  "#5a189a",
  "#7b2cbf",
  "#9d4edd",
]);

const grayscale = ["#000000", "#eeeeee"];

const palettes = [
  { id: "basic", palette: basic, name: "Basic" },
  { id: "fire", palette: fire, name: "Fire" },
  { id: "earth", palette: earth, name: "Earth" },
  { id: "florian", palette: florian, name: "Florian de Looij" },

  { id: "acidCool", palette: acidCool, name: "Acid cool" },
  { id: "acidTrip", palette: acidTrip, name: "Acid trip" },

  { id: "fieryOcean", palette: fieryOcean, name: "Fiery ocean" },
  { id: "fieryPalette", palette: fieryPalette, name: "Fiery palette" },
  {
    id: "oliveGardenFeast",
    palette: oliveGardenFeast,
    name: "Olive garden feast",
  },
  {
    id: "vibrantColorFiesta",
    palette: vibrantColorFiesta,
    name: "Vibrant color fiesta",
  },
  {
    id: "vibrantNights",
    palette: vibrantNights,
    name: "Vibrant nights",
  },
  {
    id: "refreshingSummerFun",
    palette: refreshingSummerFun,
    name: "Refreshing summmer fun",
  },
  {
    id: "mysticalGlow",
    palette: mysticalGlow,
    name: "Mystical glow",
  },
  {
    id: "blackAndGoldElegance",
    palette: blackAndGoldElegance,
    name: "Black and gold elegance",
  },
  {
    id: "brightContrasts",
    palette: brightContrasts,
    name: "Bright contrasts",
  },
  {
    id: "mysticBliss",
    palette: mysticBliss,
    name: "Mystic bliss",
  },
  {
    id: "warmAutumnGlow",
    palette: warmAutumnGlow,
    name: "Warm autumn glow",
  },
  {
    id: "naturesHarmony",
    palette: naturesHarmony,
    name: `Nature's harmony`,
  },
  {
    id: "oceanSunset",
    palette: oceanSunset,
    name: "Ocean sunset",
  },
  {
    id: "vibrantSunset",
    palette: vibrantSunset,
    name: "Vibrant sunset",
  },
  {
    id: "grayscale",
    palette: grayscale,
    name: "Grayscale",
  },
];
const paletteOptions = palettes.map((p) => [p.id, p.name]);

function getPalette(id) {
  return palettes.find((p) => p.id === id).palette;
}

export { palettes, paletteOptions, getPalette };
