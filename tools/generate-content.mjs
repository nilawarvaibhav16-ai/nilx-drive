import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve('app/src/main/assets/www/data-shells.json');

const compactBrands = ['Vanta', 'Kestrel', 'Rook', 'Morrow', 'Halden', 'Pike', 'Orren', 'Bramble', 'Cinder', 'Ferro'];
const compactModels = ['Bruiser', 'Metro', 'Nudge', 'Pylon', 'Wren'];
const compactLiveries = ['#3b414a', '#4d555f', '#58483a', '#455a52', '#625341', '#394650', '#6b4b33', '#4d5b60', '#5e4b3e', '#3e4650'];
const compactAccents = ['#d36b2f', '#f0a54a', '#b4532a', '#d58a3a', '#ffb45c', '#9b6b46', '#ca6138', '#e89b4b', '#b8753c', '#de7d47'];

const muscleBrands = ['Ironhold', 'Redoubt', 'Ruskin', 'Sledge', 'Brimstone', 'Muzzle', 'Coyote', 'Bastion', 'Torque', 'Grind'];
const muscleModels = ['Rammer', 'Howler', 'Wedge', 'Haymaker', 'Rumbler'];
const muscleLiveries = ['#7a2f22', '#6a4b23', '#384b5a', '#4f5031', '#60352f', '#2f4042', '#74532c', '#493b51', '#5a2323', '#343a3a'];
const muscleAccents = ['#ff9f43', '#ffc857', '#f56c4f', '#f7b267', '#ff7a45', '#e9c46a', '#ffad5c', '#d88bff', '#ff6242', '#ffb03a'];

const exoticBrands = ['Aerune', 'Vantari', 'Kaelis', 'Nyxora', 'Celestis', 'Sablex', 'Tessarine', 'Halcyra', 'Aventrix', 'Lumenar', 'Vorteq', 'Oberis', 'Seraphine', 'Quasaris', 'Ionix', 'Astryn', 'Novaris', 'Lyrand', 'Zenithal', 'Miran'];
const exoticModels = ['AX-1', 'AX-3', 'GT-S', 'R-9', 'VXR'];
const exoticLiveries = ['#b6ff3c', '#ffd23f', '#27e6c8', '#ff5d8f', '#f7f7f2', '#3cc9ff', '#ff8a2a', '#a58bff', '#d6ff00', '#ff4040', '#20f5a1', '#ffbf00', '#6dd5ff', '#ff72c8', '#e8f7ff', '#aa92ff', '#f4ff4f', '#53ffc2', '#ff9b5a', '#d8d8df'];
const exoticAccents = ['#0a0d10', '#ffd23f', '#0b2b2a', '#ffffff', '#121418', '#00131a', '#1a0d04', '#10081c', '#1d2200', '#250707', '#03130d', '#1b1400', '#001018', '#210515', '#0c1114', '#100b1c', '#1c1f00', '#02140f', '#1a0c02', '#101116'];

const chassisForTier = (tier) => tier === 'Exotic' ? 'sport' : 'derby';
const groupForTier = (tier) => tier === 'Exotic' ? 'Hypercar' : 'Derby';

function makeVehicle({ index, tier, brand, model, livery, accent }) {
  const prefix = tier.toLowerCase();
  const id = `${prefix}-${String(index + 1).padStart(2, '0')}`;
  let powerKw;
  let massKg;
  let topSpeedKph;
  let grip;
  let braking;
  let handling;
  let downforce;

  if (tier === 'Compact') {
    powerKw = 92 + ((index * 17) % 87);
    massKg = 980 + ((index * 23) % 380);
    topSpeedKph = 138 + ((index * 11) % 62);
    grip = Number((0.88 + (index % 7) * 0.035).toFixed(2));
    braking = Number((8.5 + (index % 5) * 0.55).toFixed(1));
    handling = Number((0.88 + (index % 9) * 0.025).toFixed(3));
    downforce = 3 + (index % 12);
  } else if (tier === 'Muscle') {
    powerKw = 280 + ((index * 29) % 310);
    massKg = 1470 + ((index * 31) % 560);
    topSpeedKph = 185 + ((index * 17) % 115);
    grip = Number((0.84 + (index % 6) * 0.03).toFixed(2));
    braking = Number((8.1 + (index % 7) * 0.4).toFixed(1));
    handling = Number((0.74 + (index % 8) * 0.03).toFixed(3));
    downforce = 6 + (index % 20);
  } else {
    powerKw = 640 + ((index * 37) % 900);
    massKg = 1290 + ((index * 19) % 510);
    topSpeedKph = 306 + ((index * 13) % 114);
    grip = Number((1.10 + (index % 10) * 0.04).toFixed(2));
    braking = Number((11.4 + (index % 6) * 0.65).toFixed(1));
    handling = Number((1.02 + (index % 9) * 0.04).toFixed(3));
    downforce = 62 + ((index * 7) % 39);
  }

  const drivetrain = tier === 'Compact'
    ? (index % 3 === 0 ? 'AWD' : (index % 2 === 0 ? 'FWD' : 'RWD'))
    : tier === 'Muscle'
      ? 'RWD'
      : (index % 4 === 0 ? 'RWD' : 'AWD');

  const descriptors = tier === 'Compact'
    ? ['welded city compact', 'rally-bred hatch shell', 'short-wheelbase wreck runner', 'reinforced panel fighter', 'industrial commuter tank']
    : tier === 'Muscle'
      ? ['big-block bruiser', 'straight-line wrecking machine', 'long-nose impact platform', 'steel-body momentum monster', 'carb-fed collision sled']
      : ['mid-engine aero missile', 'carbon-tub velocity platform', 'active-aero hyper shell', 'low-drag stunt prototype', 'electric-hybrid apex weapon'];

  return {
    id,
    name: `${brand} ${model}`,
    tier,
    group: groupForTier(tier),
    chassis: chassisForTier(tier),
    featured: id === 'compact-01' || id === 'exotic-01',
    badge: id === 'compact-01' ? 'SLATE & RUST' : id === 'exotic-01' ? 'NEON RUNNER' : tier.toUpperCase(),
    stats: {
      powerKw,
      massKg,
      topSpeedKph,
      grip,
      braking,
      handling,
      downforce,
      drivetrain
    },
    livery,
    accent,
    description: `${brand} ${model} is a ${descriptors[index % descriptors.length]} built for the Nilx content matrix. ${tier === 'Exotic' ? 'Aero grip is prioritised for 300+ km/h impact runs.' : 'Reinforced bodywork is prioritised for repeatable derby impacts.'}`
  };
}

const vehicles = [];
for (let i = 0; i < 50; i++) {
  const brand = compactBrands[Math.floor(i / compactModels.length)];
  const model = compactModels[i % compactModels.length];
  vehicles.push(makeVehicle({
    index: i,
    tier: 'Compact',
    brand,
    model,
    livery: compactLiveries[i % compactLiveries.length],
    accent: compactAccents[i % compactAccents.length]
  }));
}
for (let i = 0; i < 50; i++) {
  const brand = muscleBrands[Math.floor(i / muscleModels.length)];
  const model = muscleModels[i % muscleModels.length];
  vehicles.push(makeVehicle({
    index: i,
    tier: 'Muscle',
    brand,
    model,
    livery: muscleLiveries[i % muscleLiveries.length],
    accent: muscleAccents[i % muscleAccents.length]
  }));
}
for (let i = 0; i < 100; i++) {
  const brand = exoticBrands[Math.floor(i / exoticModels.length)];
  const model = exoticModels[i % exoticModels.length];
  vehicles.push(makeVehicle({
    index: i,
    tier: 'Exotic',
    brand,
    model,
    livery: exoticLiveries[i % exoticLiveries.length],
    accent: exoticAccents[i % exoticAccents.length]
  }));
}

const arenaPrefixes = ['Shatterline', 'Cinderfall', 'Deadbolt', 'Rustveil', 'Blacktop', 'Hollowpoint', 'Slagworks', 'Overrun', 'Nitelash', 'Crosswire'];
const arenaNouns = ['Coliseum', 'Bowl', 'Ring', 'Boneyard', 'Circuit'];
const layouts = ['oval', 'figure-8', 'crossover', 'concrete-pit', 'dirt-ring'];
const surfaces = ['cracked concrete', 'packed dirt', 'oiled asphalt', 'gravel concrete', 'sand clay'];
const environments = ['Dusk', 'Night', 'Overcast', 'Storm front', 'Industrial twilight'];
const hazardPool = ['crush walls', 'tire stacks', 'center divider', 'blind crossover', 'debris field', 'water hazard', 'jump ridge', 'steel columns', 'collapsed gantry', 'burn barrels'];

const worlds = [];
for (let i = 0; i < 50; i++) {
  const prefix = arenaPrefixes[Math.floor(i / arenaNouns.length)];
  const noun = arenaNouns[i % arenaNouns.length];
  const layout = layouts[i % layouts.length];
  const playable = i === 0;
  worlds.push({
    id: `arena-${String(i + 1).padStart(2, '0')}`,
    name: `${prefix} ${noun}`,
    category: 'Arena',
    playable,
    status: playable ? 'playable' : 'content-shell',
    layout,
    profile: `${layout} / ${surfaces[i % surfaces.length]}`,
    surface: surfaces[i % surfaces.length],
    environment: environments[i % environments.length],
    boundaryRadius: 55 + (i % 9) * 3,
    hazards: [hazardPool[i % hazardPool.length], hazardPool[(i + 3) % hazardPool.length], hazardPool[(i + 7) % hazardPool.length]],
    capacity: 8 + (i % 5) * 2,
    description: `${prefix} ${noun} is a ${layout.replace('-', ' ')} derby arena in the Nilx content matrix. The local slice renders Shatterline Coliseum; this profile reserves the ${surfaces[i % surfaces.length]} layout for the full arena catalogue.`
  });
}

const openWorlds = [
  {
    id: 'open-01',
    name: 'Skyline Airport',
    category: 'Open World',
    playable: true,
    status: 'playable',
    layout: 'airport',
    profile: 'Airport sandbox / 3.1 km runway',
    surface: 'runway asphalt and grass',
    environment: 'Clear dusk',
    boundaryRadius: 0,
    features: ['3.1 km runway', 'jump gantries', 'hangar slalom', 'wide-open speed runs'],
    hazards: ['runway barriers', 'loading crates', 'drop-off edges'],
    description: 'A wide-open airport sandbox built for top-speed runs, t-bone testing and vertical stunt launches. The playable vertical slice includes the main runway, ramps and hangar line.'
  },
  {
    id: 'open-02',
    name: 'Dune Ridge',
    category: 'Open World',
    playable: false,
    status: 'content-shell',
    layout: 'offroad-hills',
    profile: 'Off-road hill network / 31 km trails',
    surface: 'loose sand and shale',
    environment: 'High noon',
    boundaryRadius: 0,
    features: ['ridge trails', 'sand bowls', 'scree chutes', 'canyon jumps'],
    hazards: ['loose shale', 'blind crests', 'rock shelves'],
    description: 'A 31 km off-road hill network reserved in the world matrix. Ridge trails and sand bowls are registered for the full traversal build.'
  },
  {
    id: 'open-03',
    name: 'Neon Harbor',
    category: 'Open World',
    playable: false,
    status: 'content-shell',
    layout: 'urban',
    profile: 'Urban city centre / 12 km grid',
    surface: 'wet asphalt',
    environment: 'Night',
    boundaryRadius: 0,
    features: ['city grid', 'harbour tunnels', 'elevated lanes', 'plaza stunts'],
    hazards: ['tram lines', 'concrete islands', 'loading zones'],
    description: 'A rain-slick urban centre reserved in the world matrix. Harbour tunnels and the elevated lane network are registered for the full traversal build.'
  },
  {
    id: 'open-04',
    name: 'Saltline Beach',
    category: 'Open World',
    playable: false,
    status: 'content-shell',
    layout: 'beach',
    profile: 'Beach and tidal flats / 18 km coast',
    surface: 'wet sand',
    environment: 'Golden hour',
    boundaryRadius: 0,
    features: ['tidal flats', 'dune kickers', 'pier run', 'coastal loop'],
    hazards: ['soft sand', 'tide channels', 'pier supports'],
    description: 'A coastal sandbox reserved in the world matrix. Tidal flats and the pier run are registered for the full traversal build.'
  },
  {
    id: 'open-05',
    name: 'Stunt Island',
    category: 'Open World',
    playable: false,
    status: 'content-shell',
    layout: 'stunt-island',
    profile: 'High-altitude stunt island / 9 km grid',
    surface: 'mixed concrete and rock',
    environment: 'Alpine dusk',
    boundaryRadius: 0,
    features: ['high-altitude kickers', 'loop gates', 'quarry drops', 'sky bridge'],
    hazards: ['cliff edges', 'narrow bridges', 'crosswinds'],
    description: 'A high-altitude stunt island reserved in the world matrix. Loop gates and quarry drops are registered for the full traversal build.'
  }
];

const data = {
  schemaVersion: 1,
  brand: 'Nilawars Labs',
  title: 'Nilx Drive Original Vehicle Sandbox',
  generatedAt: '2026-11-04',
  contentMatrix: {
    vehicles: {
      total: vehicles.length,
      tiers: {
        Compact: vehicles.filter((v) => v.tier === 'Compact').length,
        Muscle: vehicles.filter((v) => v.tier === 'Muscle').length,
        Exotic: vehicles.filter((v) => v.tier === 'Exotic').length
      },
      groups: {
        Derby: vehicles.filter((v) => v.group === 'Derby').length,
        Hypercar: vehicles.filter((v) => v.group === 'Hypercar').length
      }
    },
    worlds: {
      total: worlds.length + openWorlds.length,
      arenas: worlds.length,
      openWorlds: openWorlds.length,
      playable: 2
    }
  },
  featured: {
    playerVehicleId: 'compact-01',
    rivalVehicleId: 'exotic-01',
    arenaWorldId: 'arena-01',
    sandboxWorldId: 'open-01'
  },
  vehicles,
  worlds: [...worlds, ...openWorlds]
};

writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`Wrote ${vehicles.length} vehicles and ${data.worlds.length} worlds to ${out}`);
