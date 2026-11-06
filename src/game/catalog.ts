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
    desc: 'Two-lane street with sidewalks. Zones grow along it.',
    good: ['Cheap', 'Gives zones road access'],
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
    desc: 'Four lanes split by a tree-lined median. Drag over a street to upgrade it.',
    good: ['Over twice the traffic capacity', 'Faster cars', 'Trees soak up a little pollution'],
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
    desc: 'Rough country lane for low-traffic edges of town.',
    good: ['Very cheap', 'Nearly free upkeep'],
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
    desc: 'Detached houses and townhouses with gardens.',
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
    desc: 'Corner shops, cafés and small offices.',
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