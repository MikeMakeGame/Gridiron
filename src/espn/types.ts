// The slice of ESPN's unofficial site API JSON this app reads. Everything optional that ESPN omits in some states.

export interface EspnTeam {
  id: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName?: string;
  name?: string;
  color?: string;
  alternateColor?: string;
  logo?: string;
  logos?: { href: string }[];
}

export interface EspnStatusType {
  name: string; // STATUS_SCHEDULED | STATUS_IN_PROGRESS | STATUS_HALFTIME | STATUS_END_PERIOD | STATUS_FINAL ...
  state: 'pre' | 'in' | 'post';
  completed: boolean;
  detail?: string;
  shortDetail?: string;
}

export interface EspnStatus {
  displayClock?: string;
  period?: number;
  type: EspnStatusType;
}

export interface EspnSituation {
  down?: number;
  distance?: number;
  yardLine?: number;
  possession?: string; // team id
  downDistanceText?: string;
  shortDownDistanceText?: string;
  possessionText?: string;
  isRedZone?: boolean;
  homeTimeouts?: number;
  awayTimeouts?: number;
  lastPlay?: {
    id?: string;
    text?: string;
    type?: { text?: string };
    probability?: { homeWinPercentage?: number };
  };
}

export interface EspnCompetitor {
  id: string;
  homeAway: 'home' | 'away';
  winner?: boolean;
  score?: string;
  team: EspnTeam;
  records?: { summary: string; type?: string }[];
  record?: { summary: string; type?: string }[];
  linescores?: { value?: number; displayValue?: string }[];
  possession?: boolean;
}

export interface EspnCompetition {
  id: string;
  date: string;
  /** false while ESPN hasn't set the kickoff time (a TBD game); its `date` is then a placeholder. */
  timeValid?: boolean;
  competitors: EspnCompetitor[];
  status: EspnStatus;
  situation?: EspnSituation;
  odds?: { details?: string; overUnder?: number }[];
  broadcasts?: { names?: string[] }[];
}

export interface EspnEvent {
  id: string;
  date: string;
  name: string;
  shortName: string;
  status: EspnStatus;
  competitions: EspnCompetition[];
}

export interface EspnScoreboard {
  week?: { number: number };
  season?: { year: number; type: number };
  /** The season's calendar: per season type ("2" regular, "3" postseason), its weeks and their labels. */
  leagues?: { calendar?: { value: string; label?: string; entries?: { value: string; label: string }[] }[] }[];
  events: EspnEvent[];
}

export interface EspnPlayEnd {
  down?: number;
  distance?: number;
  yardLine?: number; // measured from the HOME team's goal line
  yardsToEndzone?: number; // relative to the team in `team`
  downDistanceText?: string;
  shortDownDistanceText?: string;
  possessionText?: string;
  team?: { id: string };
}

export interface EspnPlay {
  id: string;
  sequenceNumber?: string;
  type?: { id: string; text: string; abbreviation?: string };
  text: string;
  awayScore: number;
  homeScore: number;
  period: { number: number };
  clock: { displayValue: string; value?: number };
  scoringPlay?: boolean;
  isPenalty?: boolean;
  isTurnover?: boolean;
  statYardage?: number;
  start: EspnPlayEnd;
  end: EspnPlayEnd;
  wallclock?: string;
}

export interface EspnDrive {
  id: string;
  description?: string;
  team: { id?: string; abbreviation: string; displayName?: string };
  start: { period: { number: number }; clock?: { displayValue: string }; yardLine?: number; text?: string };
  end?: { period: { number: number }; clock?: { displayValue: string }; yardLine?: number; text?: string };
  timeElapsed?: { displayValue: string };
  yards?: number;
  isScore?: boolean;
  offensivePlays?: number;
  result?: string;
  displayResult?: string;
  shortDisplayResult?: string;
  plays: EspnPlay[];
}

export interface EspnBoxPlayerCategory {
  name: string;
  text?: string;
  labels: string[];
  athletes: { athlete: { id: string; displayName: string; shortName?: string; position?: { abbreviation: string } }; stats: string[] }[];
}

export interface EspnVideo {
  id: number;
  headline: string;
  duration?: number; // seconds
  originalPublishDate?: string;
  thumbnail?: string;
  links?: { web?: { href?: string }; source?: { href?: string } };
  tracking?: { coverageType?: string }; // "OnePlay" for a single-play clip
}

export interface EspnSummary {
  header: {
    id: string;
    week?: number;
    season?: { year: number; type: number };
    /** As EspnCompetition's: false while the kickoff time isn't set (seen as true on every cached 2026 summary). */
    timeValid?: boolean;
    competitions: (EspnCompetition & { competitors: EspnCompetitor[] })[];
  };
  drives?: { previous?: EspnDrive[]; current?: EspnDrive };
  winprobability?: { playId: string; homeWinPercentage: number; tiePercentage?: number }[];
  boxscore?: {
    teams?: { team: EspnTeam; statistics: { name: string; label?: string; displayValue: string }[] }[];
    players?: { team: EspnTeam; statistics: EspnBoxPlayerCategory[] }[];
  };
  scoringPlays?: EspnPlay[];
  situation?: EspnSituation;
  /** ESPN's highlight clips for the game. Not tied to play ids; see ../espn/clips. */
  videos?: EspnVideo[];
  pickcenter?: { details?: string; overUnder?: number; provider?: { name: string } }[];
  meta?: { lastUpdatedAt?: string; lastPlayWallClock?: string; gameState?: string };
}
