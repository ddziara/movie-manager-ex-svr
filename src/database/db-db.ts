import { DBTable } from "./db-table";

/**
 * The class represents a database
 */
export abstract class DB {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  abstract getTable(index: number): DBTable | null;
}
