// Everything the player can place, with costs and pros/cons shown in the build menu.
import type { Kind, RoadType } from './engine'

export type ItemId =
  | 'street'
  | 'avenue'
  | 'gravel'
  | 'res_low'
  | 'res_high'
  | 'com_low'
  | 'com_high'
  | 'ind_light'
  | 'ind_heavy'
  | 'park'
  | 'power'
  | 'solar'
  | 'wind'
  | 'pylon'
  | 'substation'
  | 'cable'
  | 'overhead_transmission'
  | 'overhead_distribution'
  | 'overhead_service'
  | 'overhead_swer'
  | 'pump'
  | 'pipe'
  | 'fire'
  | 'police'
  | 'health'
  | 'school'
  | 'bulldoze'

export type Group = 'roads' | 'zones' | 'power' | 'water' | 'services' | 'tools'

export interface Item {
  id: ItemId
  name: string
  group: Group
  cost: number
  upkeep?: number // per game day
  unit?: string // "per tile" for drag tools
  kind?: Kind
  dens?: 'low' | 'high'
  road?: RoadType
  desc: string
  good: string[]
  bad: string[]
}

export const ITEMS: Item[] = [
  {
    id: 'street',
    name: 'Street',
    group: 'roads',
    cost: 100,
    upkeep: 3,
    unit: 'tile',
    kind: 'road',
    road: 'street',
    desc: 'Two-lane street with sidewalks and built-in underground power cables.',
    good: ['Cheap', 'Gives zones road access', 'Carries low-voltage electricity'],
    bad: ['Jams once traffic builds up'],
  },
  {
    id: 'avenue',
    name: 'Avenue',
    group: 'roads',
    cost: 240,
    upkeep: 6,
    unit: 'tile',
    kind: 'road',
    road: 'avenue',
    desc: 'Four lanes split by a tree-lined median, with built-in underground power cables.',
    good: ['Over twice the traffic capacity', 'Faster cars', 'Carries low-voltage electricity'],
    bad: ['Costs more to build and run'],
  },
  {
    id: 'gravel',
    name: 'Gravel lane',
    group: 'roads',
    cost: 40,
    upkeep: 1,
    unit: 'tile',
    kind: 'road',
    road: 'gravel',
    desc: 'Rough country lane for low-traffic edges of town, with a built-in power cable.',
    good: ['Very cheap', 'Nearly free upkeep', 'Carries low-voltage electricity'],
    bad: ['Slow', 'Jams almost immediately'],
  },
  {
    id: 'res_low',
    name: 'Low-density housing',
    group: 'zones',
    cost: 20,
    unit: 'tile',
    kind: 'res',
    dens: 'low',
    desc: 'Mostly compact detached houses and townhouses, with a 0.01% chance of a mansion.',
    good: ['Quiet, little traffic', 'Low crime'],
    bad: ['Few residents per tile'],
  },
  {
    id: 'res_high',
    name: 'High-density housing',
    group: 'zones',
    cost: 30,
    unit: 'tile',
    kind: 'res',
    dens: 'high',
    desc: 'Apartment blocks that grow into residential towers.',
    good: ['Many residents per tile', 'Big tax base'],
    bad: ['Needs power and water to rise', 'More crime and traffic'],
  },
  {
    id: 'com_low',
    name: 'Shops',
    group: 'zones',
    cost: 20,
    unit: 'tile',
    kind: 'com',
    dens: 'low',
    desc: 'Mostly compact corner shops and cafés, with an occasional larger store.',
    good: ['Cheap jobs close to homes'],
    bad: ['Few jobs per tile'],
  },
  {
    id: 'com_high',
    name: 'Downtown offices',
    group: 'zones',
    cost: 30,
    unit: 'tile',
    kind: 'com',
    dens: 'high',
    desc: 'Glass office towers that become skyscrapers on valuable land.',
    good: ['Lots of jobs', 'Skyline-defining towers'],
    bad: ['Heavy traffic', 'Needs high land value to reach full height'],
  },
  {
    id: 'ind_light',
    name: 'Light industry',
    group: 'zones',
    cost: 20,
    unit: 'tile',
    kind: 'ind',
    dens: 'low',
    desc: 'Workshops and warehouses.',
    good: ['Little pollution', 'Fine near homes'],
    bad: ['Fewer jobs'],
  },
  {
    id: 'ind_heavy',
    name: 'Heavy industry',
    group: 'zones',
    cost: 25,
    unit: 'tile',
    kind: 'ind',
    dens: 'high',
    desc: 'Factories with smokestacks and storage tanks.',
    good: ['Many jobs', 'Strong industrial demand'],
    bad: ['Heavy pollution', 'Higher fire risk'],
  },
  {
    id: 'park',
    name: 'Park',
    group: 'services',
    cost: 400,
    upkeep: 14,
    kind: 'park',
    desc: 'Lawns, paths, trees and sometimes a pond.',
    good: ['Raises nearby land value', 'Cleans the air'],
    bad: ['Earns no taxes'],
  },
  {
    id: 'power',
    name: 'Coal power plant',
    group: 'power',
    cost: 9000,
    upkeep: 420,
    kind: 'power',
    desc: 'Turbine hall, striped smokestack and cooling tower.',
    good: ['Huge output (2,600)', 'Works day and night'],
    bad: ['Heavy air pollution', 'Expensive'],
  },
  {
    id: 'solar',
    name: 'Solar farm',
    group: 'power',
    cost: 6000,
    upkeep: 120,
    kind: 'solar',
    desc: 'Rows of photovoltaic panels.',
    good: ['Zero pollution', 'Cheap upkeep'],
    bad: ['Smaller output (900)'],
  },
  {
    id: 'wind',
    name: 'Wind turbine',
    group: 'power',
    cost: 3500,
    upkeep: 90,
    kind: 'wind',
    desc: 'A tall three-blade turbine.',
    good: ['Zero pollution', 'Cheapest power'],
    bad: ['Small output (450)'],
  },
  {
    id: 'pylon',
    name: 'Power pylon',
    group: 'power',
    cost: 250,
    unit: 'each',
    kind: 'pylon',
    desc: 'Connects power stations to overhead lines and carries electricity between pylons up to 8 tiles away.',
    good: ['Carries power between roads, pylons and transmission lines'],
    bad: ['Must connect to a powered road, power station, line or another pylon'],
  },
  {
    id: 'substation',
    name: 'Electrical substation',
    group: 'power',
    cost: 6500,
    upkeep: 100,
    kind: 'substation',
    desc: 'A transformer hub for the power grid. Connect high-voltage transmission lines to the substation, then run distribution lines out toward neighborhoods.',
    good: ['Connects transmission to distribution', 'Needs a connected road'],
    bad: ['Must be linked to a powered line or road'],
  },
  {
    id: 'cable',
    name: 'Underground cable',
    group: 'power',
    cost: 15,
    unit: 'tile',
    desc: 'Low-voltage power cable. Drag a path to connect buildings and roads off the road network.',
    good: ['Runs underground', 'Can pass beneath buildings and roads'],
    bad: ['Must form an unbroken path to a powered network'],
  },
  {
    id: 'overhead_transmission',
    name: 'Transmission lines',
    group: 'power',
    cost: 90,
    unit: 'tile',
    desc: 'High-voltage overhead lines on tall towers, carrying power from plants and pylons to substations.',
    good: ['Longest reach between supports', 'Three-phase conductors'],
    bad: ['Expensive', 'Must connect to a powered network'],
  },
  {
    id: 'overhead_distribution',
    name: 'Distribution lines',
    group: 'power',
    cost: 45,
    unit: 'tile',
    desc: 'Medium-voltage overhead lines on crossarm poles, carrying power from substations and pylons around town.',
    good: ['Connects roads and neighborhoods', 'Visible poles and conductors'],
    bad: ['Must connect to a powered network'],
  },
  {
    id: 'overhead_service',
    name: 'Service lines / mains',
    group: 'power',
    cost: 25,
    unit: 'tile',
    desc: 'Low-voltage service mains on short posts, for the final connection to buildings.',
    good: ['Affordable local connections', 'Can pass above buildings'],
    bad: ['Shorter spans', 'Must connect to a powered network'],
  },
  {
    id: 'overhead_swer',
    name: 'SWER (Single Wire Earth Return)',
    group: 'power',
    cost: 30,
    unit: 'tile',
    desc: 'Single Wire Earth Return rural line, with one conductor and earth-return markers.',
    good: ['Economical rural electrification', 'Single conductor'],
    bad: ['Must connect to a powered network'],
  },
  {
    id: 'pump',
    name: 'Water pump',
    group: 'water',
    cost: 4500,
    upkeep: 220,
    kind: 'pump',
    desc: 'Draws river water into the pipe network. Must sit on the riverbank.',
    good: ['Supplies 2,600 water'],
    bad: ['Only reaches buildings through pipes'],
  },
  {
    id: 'pipe',
    name: 'Water pipe',
    group: 'water',
    cost: 15,
    unit: 'tile',
    desc: 'Underground main. Buildings within 2 tiles of a connected pipe get water.',
    good: ['Cheap', 'Can run under roads and zones'],
    bad: ['Must link back to a pump'],
  },
  {
    id: 'fire',
    name: 'Fire station',
    group: 'services',
    cost: 5000,
    upkeep: 260,
    kind: 'fire',
    desc: 'Sends fire trucks over the road network.',
    good: ['Fires get put out', 'Cuts fire risk by 70%'],
    bad: ['Trucks need a road route'],
  },
  {
    id: 'police',
    name: 'Police station',
    group: 'services',
    cost: 5000,
    upkeep: 260,
    kind: 'police',
    desc: 'Patrol cars and a radio mast.',
    good: ['Big drop in crime', 'Raises land value'],
    bad: ['Upkeep'],
  },
  {
    id: 'health',
    name: 'Clinic',
    group: 'services',
    cost: 6500,
    upkeep: 300,
    kind: 'health',
    desc: 'Healthcare for nearby residents.',
    good: ['Larger homes need it', 'Raises land value'],
    bad: ['Expensive to run'],
  },
  {
    id: 'school',
    name: 'School',
    group: 'services',
    cost: 6000,
    upkeep: 280,
    kind: 'school',
    desc: 'Classrooms, a flagpole and a sports field.',
    good: ['Families love it', 'Raises land value'],
    bad: ['Upkeep'],
  },
  {
    id: 'bulldoze',
    name: 'Bulldoze',
    group: 'tools',
    cost: 10,
    unit: 'tile',
    desc: 'Clears buildings, roads, trees and ruins.',
    good: ['Clears burnt-out ruins'],
    bad: ['Demolished buildings are gone for good'],
  },
]

export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<ItemId, Item>

export const GROUPS: { id: Group; name: string }[] = [
  { id: 'roads', name: 'Roads' },
  { id: 'zones', name: 'Zoning' },
  { id: 'power', name: 'Electricity' },
  { id: 'water', name: 'Water' },
  { id: 'services', name: 'Services' },
  { id: 'tools', name: 'Tools' },
]