import { SQLDataSource } from "datasource-sql";
import { Knex } from "knex";
import {
  DBDataMovieManager,
  IGetRowsFunReturn,
} from "../database/db-data-moviemanager";
import { DBDataMovieManagerKnexBase } from "../database/db-data-moviemanager-knexs-base";
import type { DBTable } from "../database/db-table";
import { LastIdReturnType } from "../database/db-types";
import { createMoviesDBLoaders, IMoviesDBLoaders } from "./loaders";

export interface IDBDataMovieManagerKnexBaseConstr {
  new (
    knex: Knex<Record<string, unknown>, unknown[]>
  ): DBDataMovieManagerKnexBase;
}

export class MoviesDataSource<
  TContext = unknown
> extends SQLDataSource<TContext> {
  private _dbDataMovieManager: DBDataMovieManager;
  private _loaders: IMoviesDBLoaders;

  constructor(
    knex: Knex<Record<string, unknown>, unknown[]>,
    dBDataMovieManagerKnexConstr: IDBDataMovieManagerKnexBaseConstr
  ) {
    super(knex);
    this._dbDataMovieManager = new dBDataMovieManagerKnexConstr(this.knex);
    this._loaders = createMoviesDBLoaders(this._dbDataMovieManager);
  }

  async clearTables() {
    const dbDataMovieManager = this._dbDataMovieManager;

    if (dbDataMovieManager.ready) {
      let indx = 0;
      let tab;

      while ((tab = dbDataMovieManager.dbcldb.getTable(indx++)) != null)
        await dbDataMovieManager.clearTable(tab);
      //==
      indx = 0;
      while ((tab = dbDataMovieManager.dbextra.getTable(indx++)) != null)
        await dbDataMovieManager.clearTable(tab);
      //==
      indx = 0;
      while (
        (tab = dbDataMovieManager.dbmediaScannerCache.getTable(indx++)) != null
      )
        await dbDataMovieManager.clearTable(tab);
      //==
      indx = 0;
      while ((tab = dbDataMovieManager.dbmoviemedia.getTable(indx++)) != null)
        await dbDataMovieManager.clearTable(tab);
      //==
      indx = 0;
      while ((tab = dbDataMovieManager.dbplaylist.getTable(indx++)) != null)
        await dbDataMovieManager.clearTable(tab);

      this._loaders.groupsOfMovie.clearAll();
      this._loaders.groupsInType.clearAll();
      this._loaders.moviesInGroup.clearAll();
      this._loaders.typeOfGroup.clearAll();
    }
  }

  async init(): Promise<void> {
    if (this._dbDataMovieManager) {
      await this._dbDataMovieManager.init();

      this._loaders.groupsOfMovie.clearAll();
      this._loaders.groupsInType.clearAll();
      this._loaders.moviesInGroup.clearAll();
      this._loaders.typeOfGroup.clearAll();
      return;
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

  async dumpTable(table: DBTable, label?: string | undefined): Promise<void> {
    return this._dbDataMovieManager.dumpTable(table, label);
  }

  async clearTable(table: DBTable): Promise<void> {
    // Playlist
    if (table.name === this._dbDataMovieManager.dbplaylist.playlistinfo.name) {
      this._loaders.groupsOfMovie.clearAll();
      this._loaders.groupsInType.clearAll();
    }

    if (table.name === this._dbDataMovieManager.dbplaylist.playiteminfo.name) {
      this._loaders.moviesInGroup.clearAll();
      this._loaders.groupsOfMovie.clearAll();
    }

    // Extra
    if (table.name === this._dbDataMovieManager.dbextra.moviegrouptype.name) {
      this._loaders.typeOfGroup.clearAll();
    }

    if (
      table.name ===
      this._dbDataMovieManager.dbextra.moviegrouptypemoviegroup.name
    ) {
      this._loaders.groupsOfMovie.clearAll();
      this._loaders.groupsInType.clearAll();
    }

    if (table.name === this._dbDataMovieManager.dbmoviemedia.media_info.name) {
      this._loaders.moviesInGroup.clearAll();
    }

    return this._dbDataMovieManager.clearTable(table);
  }

  async getMovieGroupTypes(
    tid: number | undefined,
    ex_column_names?: string[] | undefined,
    first?: number | undefined,
    after?: Record<string, unknown> | undefined,
    last?: number | undefined,
    before?: Record<string, unknown> | undefined,
    offset?: number | undefined
  ): Promise<IGetRowsFunReturn> {
    if (tid === undefined) {
      return await this._dbDataMovieManager.getMovieGroupTypes(
        undefined,
        ex_column_names,
        first,
        after,
        last,
        before,
        offset
      );
    } else {
      return (await this._loaders.typeOfGroup.load({
        key: tid,
        params: { ex_column_names },
      })) as IGetRowsFunReturn;
    }
  }

  async addMovieGroupType(
    column_names: string[],
    column_values: unknown[]
  ): Promise<LastIdReturnType> {
    return this._dbDataMovieManager.addMovieGroupType(
      column_names,
      column_values
    );
  }

  async updateMovieGroupType(
    tid: number,
    column_names: string[],
    column_values: unknown[]
  ): Promise<void> {
    this._loaders.typeOfGroup.clear({ key: tid });

    return this._dbDataMovieManager.updateMovieGroupType(
      tid,
      column_names,
      column_values
    );
  }

  async deleteMovieGroupType(tid: number): Promise<void> {
    this._loaders.typeOfGroup.clear({ key: tid });
    this._loaders.groupsInType.clear({ key: tid });

    return this._dbDataMovieManager.deleteMovieGroupType(tid);
  }

  async getMovieGroups(
    tid: number | undefined,
    gid: number | undefined,
    ex_column_names?: string[] | undefined,
    first?: number | undefined,
    after?: Record<string, unknown> | undefined,
    last?: number | undefined,
    before?: Record<string, unknown> | undefined,
    offset?: number | undefined
  ): Promise<IGetRowsFunReturn> {
    if (tid === undefined) {
      return this._dbDataMovieManager.getMovieGroups(
        tid,
        gid,
        ex_column_names,
        first,
        after,
        last,
        before,
        offset
      );
    } /*if(tid !== undefined)*/ else {
      return this._loaders.groupsInType.load({
        key: tid,
        params: { ex_column_names },
      });
    }
  }

  async addMovieGroup(
    tid: number | undefined,
    mid: string | undefined,
    column_names: string[],
    column_values: unknown[]
  ): Promise<LastIdReturnType> {
    if (tid !== undefined) this._loaders.groupsInType.clear({ key: tid });

    return this._dbDataMovieManager.addMovieGroup(
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
    this._loaders.groupsOfMovie.clearAll();

    return this._dbDataMovieManager.updateMovieGroup(
      gid,
      column_names,
      column_values
    );
  }

  async deleteMovieGroup(gid: number): Promise<void> {
    this._loaders.groupsOfMovie.clearAll();

    return this._dbDataMovieManager.deleteMovieGroup(gid);
  }

  async moveMovieGroup2AnotherType(
    gid: number,
    new_tid: number
  ): Promise<void> {
    this._loaders.groupsInType.clearAll();
    this._loaders.groupsOfMovie.clearAll();
    return this._dbDataMovieManager.moveMovieGroup2AnotherType(gid, new_tid);
  }

  async moveMovieGroup2NoType(tid: number, gid: number): Promise<void> {
    this._loaders.groupsInType.clearAll();
    this._loaders.groupsOfMovie.clearAll();
    return this._dbDataMovieManager.moveMovieGroup2NoType(tid, gid);
  }

  async getMovies(
    gid: number | undefined,
    mid: string | undefined,
    ex_column_names?: string[] | undefined,
    first?: number | undefined,
    after?: Record<string, unknown> | undefined,
    last?: number | undefined,
    before?: Record<string, unknown> | undefined,
    offset?: number | undefined
  ): Promise<IGetRowsFunReturn> {
    if (gid === undefined) {
      return this._dbDataMovieManager.getMovies(
        gid,
        mid,
        ex_column_names,
        first,
        after,
        last,
        before,
        offset
      );
    } else {
      return this._loaders.moviesInGroup.load({
        key: gid,
        params: { ex_column_names },
      });
    }
  }

  async addMovie(
    gid: number | undefined,
    new_listOrder: number | undefined,
    column_names: string[],
    column_values: unknown[] /*, mediaFullPath: string*/
  ): Promise<string> {
    if (gid !== undefined) this._loaders.moviesInGroup.clear({ key: gid });

    return this._dbDataMovieManager.addMovie(
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
    this._loaders.moviesInGroup.clearAll();

    return this._dbDataMovieManager.updateMovie(
      mid,
      column_names,
      column_values
    );
  }

  async deleteMovie(mid: string): Promise<void> {
    this._loaders.moviesInGroup.clearAll();

    return this._dbDataMovieManager.deleteMovie(mid);
  }

  async markMovieGroupMember(
    mid: string,
    new_gid: number,
    new_listOrder?: number
  ): Promise<void> {
    this._loaders.moviesInGroup.clear({ key: new_gid });
    this._loaders.groupsOfMovie.clear({ key: mid });

    return this._dbDataMovieManager.markMovieGroupMember(
      mid,
      new_gid,
      new_listOrder
    );
  }

  async unmarkMovieGroupMember(gid: number, mid: string): Promise<void> {
    this._loaders.moviesInGroup.clear({ key: gid });
    this._loaders.groupsOfMovie.clear({ key: mid });

    return this._dbDataMovieManager.unmarkMovieGroupMember(gid, mid);
  }

  async getGroupsOfMovie(
    mid: string,
    ex_column_names?: string[] | undefined,
    first?: number | undefined,
    after?: Record<string, unknown> | undefined,
    last?: number | undefined,
    before?: Record<string, unknown> | undefined,
    offset?: number | undefined
  ): Promise<IGetRowsFunReturn> {
    // return this._dbDataMovieManager.getGroupsOfMovie(
    //   mid,
    //   ex_column_names,
    //   first,
    //   after,
    //   last,
    //   before,
    //   offset
    // );
    return this._loaders.groupsOfMovie.load({
      key: mid,
      params: { ex_column_names },
    })
  }
}
