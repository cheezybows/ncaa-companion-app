import type { Dynasty, ParseResult, Roster, Team } from '@ncaa/domain';

export interface GameFileParser<T> {
  id: string;
  name: string;
  /** File kinds this parser can handle */
  supportedKinds: string[];
  canParse(fileName: string, extension: string): boolean;
  parse(buffer: Buffer, fileName: string): Promise<ParseResult<T>>;
}

export class ParserRegistry {
  private rosterParsers: GameFileParser<Roster>[] = [];
  private teamParsers: GameFileParser<Team[]>[] = [];
  private dynastyParsers: GameFileParser<Dynasty>[] = [];

  registerRosterParser(parser: GameFileParser<Roster>): void {
    this.rosterParsers.push(parser);
  }

  registerTeamParser(parser: GameFileParser<Team[]>): void {
    this.teamParsers.push(parser);
  }

  registerDynastyParser(parser: GameFileParser<Dynasty>): void {
    this.dynastyParsers.push(parser);
  }

  getRosterParsers(): GameFileParser<Roster>[] {
    return [...this.rosterParsers];
  }

  getTeamParsers(): GameFileParser<Team[]>[] {
    return [...this.teamParsers];
  }

  getDynastyParsers(): GameFileParser<Dynasty>[] {
    return [...this.dynastyParsers];
  }
}

export const defaultParserRegistry = new ParserRegistry();
