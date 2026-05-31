export type Team = 'blue' | 'red';
export type UnitKind = 'helicopter' | 'aaa' | 'tank';
export type WeaponKind = 'cannon' | 'missile';

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface UnitStats {
  readonly maxHealth: number;
  readonly maxSpeedMps: number;
  readonly reverseSpeedMps: number;
  readonly strafeSpeedMps: number;
  readonly turnRateRad: number;
  readonly turretTurnRateRad: number;
  readonly minAltitudeM: number;
  readonly maxAltitudeM: number;
  readonly climbRateMps: number;
  readonly sightRangeM: number;
  readonly cannonRangeM: number;
  readonly missileRangeM: number;
  readonly accelerationMps2: number;
  readonly decelerationMps2: number;
}


export interface Unit {
  readonly id: string;
  readonly kind: UnitKind;
  readonly team: Team;
  position: Vec2;
  altitudeM: number;
  headingRad: number;
  turretRad: number;
  health: number;
  missiles: number;
  velocityMps: Vec2;
  autopilotTarget?: Vec2;
  lastSeenAtS?: number;
  revealedToBlue: boolean;
}

export interface Projectile {
  readonly id: string;
  readonly weapon: WeaponKind;
  readonly team: Team;
  readonly shooterId: string;
  readonly targetId: string;
  position: Vec2;
  ttlS: number;
  damage: number;
  speedMps: number;
}

export interface Tracer {
  readonly id: string;
  readonly team: Team;
  readonly shooterId: string;
  start: Vec2;
  end: Vec2;
  ttlS: number;
}

export interface FrontSegment {
  readonly id: string;
  y: number;
  blueControlX: number;
  pressure: number;
}

export interface BattleState {
  readonly mapSizeM: number;
  timeS: number;
  selectedUnitId: string;
  terrain: TerrainMap;
  units: Unit[];
  projectiles: Projectile[];
  tracers: Tracer[];
  fronts: FrontSegment[];
  blueTerritoryRatio: number;
  status: 'planning' | 'flying' | 'blueVictory' | 'redVictory';
  message: string;
  defeatReason?: string;
}


export interface TerrainSample {
  readonly heightM: number;
  readonly water: number;
  readonly forest: number;
  readonly slope: number;
}

export interface TerrainMap {
  readonly sizeM: number;
  sample(xM: number, yM: number): TerrainSample;
}

export interface PilotInput {
  readonly forward: number;
  readonly strafe: number;
  readonly turn: number;
  readonly climb: number;
  readonly fireMissile: boolean;
  readonly fireCannon: boolean;
  readonly setAutopilotTarget?: Vec2;
}
