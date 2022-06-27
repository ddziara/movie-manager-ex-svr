import { DBTable } from "./db-table";
import { ILifeCycleDBData } from "./i-life-cycle-db.data";
import { IAccessDBData } from "./i-access-db-data";

/**
 * Base class representing data source
 */
export abstract class DBData implements ILifeCycleDBData, IAccessDBData {
  ready = false;

  abstract init(): Promise<DBData>;
  abstract uninit(): Promise<void>;

  abstract execQuery(sql: string, ...params: unknown[]): Promise<Record<string, unknown>[]>;
  abstract execRetID(
    id: string,
    sql: string,
    ...params: unknown[]
  ): Promise<number>;
  abstract execRetVoid(sql: string, ...params: unknown[]): Promise<void>;
  abstract getSQLParameter(index: number): string;

  async dumpTable(table: DBTable, label?: string): Promise<void> {
    if (label) console.log(label);
    else console.log(`TABLE ${table.getExtendedName()}:`);

    const sql = table.getSQLDumpText();

    // executes SQL query and calls callback for all rows
    try {
      const rows = await this.execQuery(sql);
      let txt = "";

      rows.forEach((element) => {
        txt += "{ ";

        for (const v in element) {
          //console.log(`typeof element[${v}]=${typeof element[v]}`);
          const col =
            typeof element[v] !== "string"
              ? `${v}: ${element[v]}, `
              : `${v}: "${element[v]}", `;
          txt += col;
        }

        txt += "}\n";
      });

      console.log(txt);
    } catch (err: any) {
      console.log(`Error: ${err.message}, sql=${sql}`);
    }
  }

  async clearTable(table: DBTable, useSchema = true): Promise<void> {
    const sql: string = table.getSQLClearText(useSchema);

    await this.execRetVoid(sql);
  }

  async beginTransaction(): Promise<void> {
    await this.execRetVoid("BEGIN TRANSACTION");
  }

  async commitTransaction(): Promise<void> {
    await this.execRetVoid("COMMIT TRANSACTION");
  }

  async rollbackTransaction(): Promise<void> {
    await this.execRetVoid("ROLLBACK TRANSACTION");
  }
}
