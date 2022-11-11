import { DBTable } from "./db-table";
import { ILifeCycleDBData } from "./i-life-cycle-db.data";

export interface ITabInfo {
  schema?: string;
  table: string; 
}

/**
 * Base class representing data source
 */
export abstract class DBData implements ILifeCycleDBData {
  ready = false;

  abstract init(): Promise<DBData>;
  abstract uninit(): Promise<void>;

  protected abstract execQuery(
    sql: string,
    ...params: unknown[]
  ): Promise<Record<string, unknown>[]>;
  protected abstract execRetID(
    id: string,
    sql: string,
    ...params: unknown[]
  ): Promise<number>;
  protected abstract execRetVoid(
    sql: string,
    ...params: unknown[]
  ): Promise<void>;

  /**
   * Method transforms SQL query parameter position to parameter string like "?"
   * 
   * @param index - 0-based postiion of paremeter in SQL query
   * @returns parameter string corresponding to "index"
   */
  protected abstract getSQLParameter(index: number): string;

  // for extra row with total count of rows

  /**
   * Method returns ordering for total count column, either "DESC" or "ASC"
   * 
   * @returns ordering
   */
  protected abstract getTotalCountColumnOrdering(): string;

  /**
   * Method returns some value for column in given table. If 'tabName' is undefined then the first found value for "colName" is returned
   * 
   * @param tabInfo - array of [schema]/table pairs or "undefined" when column is ana alias
   * @param colName - column name
   */
  protected abstract getTotalCountRowColumnValue(tabInfo: ITabInfo[] | undefined, colName: string): string;

  //================================================================
  protected _throwIfNotReady() {
    if (!this.ready) throw new Error("Database is not ready");
  }

  protected _getUseTableSchema(): boolean {
    return true;
  }
  protected _getUseIndexSchema(): boolean {
    return true;
  }
  protected _getUseIndexTableSchema(): boolean {
    return false;
  }

  async dumpTable(table: DBTable, label?: string): Promise<void> {
    this._throwIfNotReady();
    if (label) console.log(label);
    else console.log(`TABLE ${table.getExtendedName()}:`);

    const sql = table.getSQLDumpText();

    // executes SQL query and calls callback for all rows
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
  }

  async clearTable(table: DBTable): Promise<void> {
    this._throwIfNotReady();
    const sql: string = table.getSQLClearText(this._getUseTableSchema());

    await this.execRetVoid(sql);
  }

  protected async beginTransaction(): Promise<void> {
    await this.execRetVoid("BEGIN TRANSACTION");
  }

  protected async commitTransaction(): Promise<void> {
    await this.execRetVoid("COMMIT TRANSACTION");
  }

  protected async rollbackTransaction(): Promise<void> {
    await this.execRetVoid("ROLLBACK TRANSACTION");
  }
}
