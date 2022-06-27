import { DB } from "./db-db";

/**
 * The class represents a table
 */
export abstract class DBTable {
  DB: DB;
  name: string;

  constructor(db: DB, name: string) {
    this.DB = db;
    this.name = name;
  }

  abstract getSQLCreateText(
    useTableSchema?: boolean /*= true*/,
    useIndexSchema?: boolean /*= true*/,
    useIndexTableSchema?: boolean /*= false*/
  ): string[];

  getSQLClearText(useSchema = true): string {
    const sqlText = `DELETE FROM ${
      useSchema ? this.getExtendedName(this.name) : this.name
    }`;

    return sqlText;
  }

  getSQLDumpText(useSchema = true): string {
    const sqlText = `SELECT * FROM ${
      useSchema ? this.getExtendedName(this.name) : this.name
    }`;

    return sqlText;
  }

  getSQLDropText(useSchema = true): string {
    const sqlText = `DROP TABLE IF EXISTS ${
      useSchema ? this.getExtendedName(this.name) : this.name
    }`;

    return sqlText;
  }

  getExtendedName(name?: string): string {
    if (this.DB.name) {
      return name ? `${this.DB.name}.${name}` : `${this.DB.name}.${this.name}`;
    } else {
      return name ? `${name}` : `${this.name}`;
    }
  }
}
