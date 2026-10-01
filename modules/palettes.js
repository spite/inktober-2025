// Hex values are what shows on screen (see three.js).

const sumi = ["#030306", "#0b0e14", "#312921", "#6c5d4c", "#a41409"];
const indigo = ["#020413", "#050f39", "#102f6b", "#40709c", "#c47723"];
const dusk = ["#030512", "#210a29", "#741835", "#bc4329", "#ca8e46"];
const terracotta = ["#0e0503", "#3e0b04", "#83200a", "#a45227", "#b78d55"];
const riso = ["#07145c", "#a81343", "#d83a1d", "#d29a18"];
const glacier = ["#01040a", "#061222", "#17344e", "#3a6980", "#729ca8"];
const berry = ["#130208", "#4f061d", "#af1e21", "#be5a34", "#be8a56"];
const ink = ["#0b0d12", "#2f3339", "#625d56", "#918b84", "#c2bdb7"];

// The last entry gets the largest share of a gradient, so each ends on its main colour.
const cobaltCoral = ["#03103e", "#18349b", "#4683c5", "#f58967", "#d73626"];
const violetGold = ["#1c043d", "#562595", "#a55fb9", "#eab444", "#d57700"];
const magentaTangerine = ["#f7cc4b", "#fa8927", "#ed4a49", "#3e0026", "#b10b69"];
const crimsonNavy = ["#040e25", "#17306d", "#4773ab", "#ea6f2f", "#b71824"];
const ultramarine = ["#050c42", "#16229b", "#2961ce", "#67a3e0", "#f4993c"];
const saffron = ["#2d1205", "#7f3300", "#ce6500", "#eba002", "#f4cd4b"];
const lilacApricot = ["#2a1c56", "#f2ad73", "#de6129", "#ae96da", "#7055b0"];
const scarletInk = ["#04070f", "#252e3d", "#c50710", "#ee5d2b", "#c4b4a3"];
const amethyst = ["#15082c", "#3c2566", "#6f4fa1", "#a280c8", "#cab4db"];
const peony = ["#3a0921", "#971558", "#dc467d", "#f3909d", "#426ec2"];

const basic = [
  "#030406",
  "#111b25",
  "#445a74",
  "#9cb1ca",
  "#e9eff6",
  "#d4740b",
  "#cc120c",
];

const fire = [
  "#fa2d17",
  "#fd1407",
  "#000104",
  "#d44f3d",
  "#be0401",
  "#0b0104",
  "#f28820",
];

const earth = [
  "#fd241a",
  "#010410",
  "#9d0f03",
  "#fde29c",
  "#da8861",
  "#180e11",
  "#c24707",
];

const florian = ["#045a67", "#d60d0a", "#ff6c02"];

const autumnIntoWinter = [
  "#b8670f",
  "#7c0a12",
  "#354f4a",
  "#efebe2",
  "#0c170e",
  "#070708",
  "#d4740b",
  "#ffffff",
];

const clayForest = ["#fde29c", "#c24707", "#7c0a12", "#354f4a", "#0c170e"];

// https://coolors.co/palettes/trending

const fieryOcean = ["#300000", "#880203", "#fadeaa", "#000811", "#225480"];
const oliveGardenFeast = [
  "#1e260a",
  "#050902",
  "#fdf4be",
  "#b85b1d",
  "#802605",
];
const refreshingSummerFun = [
  "#4597ca",
  "#045780",
  "#000810",
  "#ff7900",
  "#f63c00",
];
const warmAutumnGlow = [
  "#000811",
  "#ab0505",
  "#ed3600",
  "#f88511",
  "#d2c279",
];
const mysticBliss = [
  "#7a7aa3",
  "#1b1d4f",
  "#ff880f",
  "#fffff6",
  "#ff2526",
];
const vibrantNights = [
  "#390020",
  "#b10023",
  "#d2bab3",
  "#070613",
  "#ffa800",
];
const palettes = [
  { id: "sumi", palette: sumi, name: "Sumi" },
  { id: "indigo", palette: indigo, name: "Indigo" },
  { id: "dusk", palette: dusk, name: "Dusk" },
  { id: "terracotta", palette: terracotta, name: "Terracotta" },
  { id: "riso", palette: riso, name: "Risograph" },
  { id: "glacier", palette: glacier, name: "Glacier" },
  { id: "berry", palette: berry, name: "Berry" },
  { id: "ink", palette: ink, name: "Ink wash" },

  { id: "cobaltCoral", palette: cobaltCoral, name: "Cobalt & coral" },
  { id: "violetGold", palette: violetGold, name: "Violet & gold" },
  { id: "magentaTangerine", palette: magentaTangerine, name: "Magenta & tangerine" },
  { id: "crimsonNavy", palette: crimsonNavy, name: "Crimson & navy" },
  { id: "ultramarine", palette: ultramarine, name: "Ultramarine" },
  { id: "saffron", palette: saffron, name: "Saffron" },
  { id: "lilacApricot", palette: lilacApricot, name: "Lilac & apricot" },
  { id: "scarletInk", palette: scarletInk, name: "Scarlet & ink" },
  { id: "amethyst", palette: amethyst, name: "Amethyst" },
  { id: "peony", palette: peony, name: "Peony" },

  { id: "basic", palette: basic, name: "Basic" },
  { id: "fire", palette: fire, name: "Fire" },
  { id: "earth", palette: earth, name: "Earth" },
  { id: "florian", palette: florian, name: "Florian de Looij" },
  {
    id: "autumnIntoWinter",
    palette: autumnIntoWinter,
    name: "Autumn into winter",
  },
  { id: "clayForest", palette: clayForest, name: "Clay Forest" },

  { id: "fieryOcean", palette: fieryOcean, name: "Fiery ocean" },
  {
    id: "oliveGardenFeast",
    palette: oliveGardenFeast,
    name: "Olive garden feast",
  },
  {
    id: "vibrantNights",
    palette: vibrantNights,
    name: "Vibrant nights",
  },
  {
    id: "refreshingSummerFun",
    palette: refreshingSummerFun,
    name: "Refreshing summer fun",
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
];
const paletteOptions = palettes.map((p) => [p.id, p.name]);

// Unknown ids fall back to the first palette.
function getPalette(id) {
  return (palettes.find((p) => p.id === id) ?? palettes[0]).palette;
}

export { palettes, paletteOptions, getPalette };
