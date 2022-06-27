import { SQLDataSource } from "datasource-sql";
import type { Knex } from "knex";
import { AppPlatformType } from "../common/types";
import {
  DBDataMovieManager,
  IGetRowsFunReturn,
} from "../database/db-data-moviemanager";
import { DBDataMovieManagerCyberlink } from "../database/db-data-moviemanager-cyberlink";
import {
  getCyberlinkRootDBName,
  getCyberlinkRootDBPath,
} from "../database/db-path-cyberlink";
import type { DBTable } from "../database/db-table";
import { LastIdReturnType } from "../database/db-types";

interface IParamFun<TResult = unknown> {
  (...params: unknown[]): TResult;
}

export class MoviesDataSource extends SQLDataSource {
  private _dbDataMovieManager: DBDataMovieManager | undefined;
  private _appPlatform: AppPlatformType;

  constructor(appPlatform: AppPlatformType) {
    let config: Knex.Config = {};

    if (appPlatform === "cyberlink") {
      const path = getCyberlinkRootDBPath();

      config = {
        client: "better-sqlite3",
        connection: {
          filename: path.concat(getCyberlinkRootDBName()),
        },
      };
    } else if (appPlatform === "postgress") {
      // TODO:
      throw new Error("");
    } else {
      throw new Error("Unsupported application platform");
    }

    super(config);
    this._appPlatform = appPlatform;
  }

  async init(): Promise<void> {
    if (this._appPlatform === "cyberlink") {
      this._dbDataMovieManager = new DBDataMovieManagerCyberlink(this.knex);
      await this._dbDataMovieManager.init();
      return;
    } else if (this._appPlatform === "postgress") {
      throw new Error("");
    }

    throw new Error("");
  }

  async uninit(): Promise<void> {
    if (this._dbDataMovieManager) await this._dbDataMovieManager.uninit();
  }

  get ready(): boolean {
    if (!this._dbDataMovieManager) return false;
    return this._dbDataMovieManager.ready;
  }

  private _callWrapper<TResult>(
    fun: IParamFun<TResult> | undefined,
    ...params: unknown[]
  ): TResult {
    if (fun && this._dbDataMovieManager) {
      return fun(...params);
    } else {
      throw new Error("Database is not ready");
    }
  }

  async dumpTable(table: DBTable, label?: string | undefined): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.dumpTable.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>,
      table,
      label
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async clearTable(table: DBTable, useSchema = true): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.clearTable.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>
    );
  }

  async beginTransaction(): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.beginTransaction.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>
    );
  }

  async commitTransaction(): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.commitTransaction.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>
    );
  }

  async rollbackTransaction(): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.rollbackTransaction.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>
    );
  }

  async getMovieGroupTypes(
    tid: number | undefined,
    limit?: number,
    offset?: number
  ): Promise<IGetRowsFunReturn> {
    return this._callWrapper(
      this._dbDataMovieManager?.getMovieGroupTypes.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<IGetRowsFunReturn>>,
      tid,
      limit,
      offset
    );
  }

  async addMovieGroupType(
    column_names: string[],
    column_values: unknown[]
  ): Promise<LastIdReturnType> {
    return this._callWrapper(
      this._dbDataMovieManager?.addMovieGroupType.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<LastIdReturnType>>,
      column_names,
      column_values
    );
  }

  async updateMovieGroupType(
    tid: number,
    column_names: string[],
    column_values: unknown[]
  ): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.updateMovieGroupType.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>,
      tid,
      column_names,
      column_values
    );
  }

  async deleteMovieGroupType(tid: number): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.deleteMovieGroupType.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>,
      tid
    );
  }

  async getMovieGroups(
    tid: number | undefined,
    gid: number | undefined,
    ex_column_names?: string[] | undefined,
    limit?: number,
    offset?: number
  ): Promise<IGetRowsFunReturn> {
    return this._callWrapper(
      this._dbDataMovieManager?.getMovieGroups.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<IGetRowsFunReturn>>,
      tid,
      gid,
      ex_column_names,
      limit,
      offset
    );
  }

  async addMovieGroup(
    tid: number | undefined,
    mid: string | undefined,
    column_names: string[],
    column_values: unknown[]
  ): Promise<LastIdReturnType> {
    return this._callWrapper(
      this._dbDataMovieManager?.addMovieGroup.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<LastIdReturnType>>,
      tid,
      mid,
      column_names,
      column_values
    );
  }

  async updateMovieGroup(
    gid: number,
    column_names: string[],
    column_values: unknown[]
  ): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.updateMovieGroup.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>,
      gid,
      column_names,
      column_values
    );
  }

  async deleteMovieGroup(gid: number): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.deleteMovieGroup.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>,
      gid
    );
  }

  async moveMovieGroup2AnotherType(
    gid: number,
    new_tid: number
  ): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.moveMovieGroup2AnotherType.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>,
      gid,
      new_tid
    );
  }

  async moveMovieGroup2NoType(tid: number, gid: number): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.moveMovieGroup2NoType.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>,
      tid,
      gid
    );
  }

  async getMovies(
    gid: number | undefined,
    mid: string | undefined,
    ex_column_names?: string[] | undefined,
    limit?: number,
    offset?: number
  ): Promise<IGetRowsFunReturn> {
    return this._callWrapper(
      this._dbDataMovieManager?.getMovies.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<IGetRowsFunReturn>>,
      gid,
      mid,
      ex_column_names,
      limit,
      offset
    );
  }

  async addMovie(
    gid: number | undefined,
    new_listOrder: number | undefined,
    column_names: string[],
    column_values: unknown[] /*, mediaFullPath: string*/
  ): Promise<string> {
    return this._callWrapper(
      this._dbDataMovieManager?.addMovie.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<string>>,
      gid,
      new_listOrder,
      column_names,
      column_values
    );
  }

  async updateMovie(
    mid: string,
    column_names: string[],
    column_values: unknown[]
  ): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.updateMovie.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>,
      mid,
      column_names,
      column_values
    );
  }

  async deleteMovie(mid: string): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.deleteMovie.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>,
      mid
    );
  }

  async markMovieGroupMember(
    mid: string,
    new_gid: number,
    new_listOrder?: number
  ): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.markMovieGroupMember.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>,
      mid,
      new_gid,
      new_listOrder
    );
  }

  async unmarkMovieGroupMember(gid: number, mid: string): Promise<void> {
    return this._callWrapper(
      this._dbDataMovieManager?.unmarkMovieGroupMember.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<void>>,
      gid,
      mid
    );
  }

  async getGroupsOfMovie(
    mid: string,
    limit?: number,
    offset?: number
  ): Promise<IGetRowsFunReturn> {
    return this._callWrapper(
      this._dbDataMovieManager?.getGroupsOfMovie.bind(
        this._dbDataMovieManager
      ) as IParamFun<Promise<IGetRowsFunReturn>>,
      mid,
      limit,
      offset
    );
  }
}
