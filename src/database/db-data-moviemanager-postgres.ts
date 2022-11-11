import { DB } from "./db-db";
import { DBTable } from "./db-table";
import DEBUG from "debug";
import { MissingLastIdError } from "../common/errors";
import { dateToUTCString } from "./utils";
import { Knex } from "knex";

const debug_db = DEBUG.debug("backend:DB");

// for optional imports
import pg from "pg";
import { DBcldb } from "./db-db-cldb";
import { AppPlatformType } from "../common/types";
import { DBextra } from "./db-db-extra";
import { DBmedia_scanner_cache } from "./db-db-media-scanner-cache";
import { DBmoviemedia } from "./db-db-moviemedia";
import { DBplaylist } from "./db-db-playlist";
import { DBDataMovieManagerKnexBase } from "./db-data-moviemanager-knexs-base";
import { ITabInfo } from "./db-data";
// for optional imports [END]

// for optional imports
// let Pool: typeof PoolType;

// ({ Pool } = require('pg'));
// setupPostgresParsers();

// for optional imports [END]

export interface IPostgresRunReturn {
  rowCount: number;
  rows: Record<string, unknown>[];
}

const appPlatform: AppPlatformType = "postgres";

export class DBDataMovieManagerPostgres extends DBDataMovieManagerKnexBase {
  constructor(knex: Knex) {
    super(
      new DBcldb(appPlatform),
      new DBextra(appPlatform),
      new DBmedia_scanner_cache(appPlatform),
      new DBmoviemedia(appPlatform),
      new DBplaylist(appPlatform),
      knex
    );
    this._setupPostgresParsers();
  }

  async createSchemaCreateTables(db: DB): Promise<void> {
    await this.execRetVoid(`CREATE SCHEMA IF NOT EXISTS ${db.name}`);

    let index = 0;
    let table: DBTable | null;

    while ((table = db.getTable(index++)) !== null) {
      const aSql: string[] = table.getSQLCreateText(true, false, true);

      for (const sql of aSql) {
        try {
          await this.execRetVoid(sql);
        } catch (e) {
          debug_db(`Creating table '${table.name} sql=${sql}' failed`);
          throw e;
        }
      }
    }
  }

  private _setupPostgresParsers = (): void => {
    const tps = pg.types;

    //  timestamp
    // In Posgres database TIMESTAMP precisions is in microseconds
    // and in JS type of 'Date' it is miliseconds
    tps.setTypeParser(1114, function (val) {
      const dt = new Date(val + "+0000");
      const d_str = dateToUTCString(dt);
      //  return d_str.substr(0, d_str.length - 3);
      return d_str;
    });

    //  int8
    tps.setTypeParser(20, function (val) {
      return parseInt(val);
    });

    //  bool
    tps.setTypeParser(16, function (val) {
      return val === "t" ? 1 : 0;
    });
  };

  private _debugSuccess(db: DB) {
    debug_db(`Schema '${db.name}' set up.`);
  }

  private _debugFailure(db: DB) {
    debug_db(`Setting up Schema '${db.name}' failed`);
  }

  async init(): Promise<DBDataMovieManagerPostgres> {
    this.ready = false;

    await Promise.all([
      (async () => {
        try {
          await this.createSchemaCreateTables(this.dbcldb);
          this._debugSuccess(this.dbcldb);
        } catch (e) {
          this._debugFailure(this.dbcldb);
          throw e;
        }
      })(),
      (async () => {
        try {
          await this.createSchemaCreateTables(this.dbmoviemedia);
          this._debugSuccess(this.dbmoviemedia);
        } catch (e) {
          this._debugFailure(this.dbmoviemedia);
          throw e;
        }
      })(),
      (async () => {
        try {
          await this.createSchemaCreateTables(this.dbmediaScannerCache);
          this._debugSuccess(this.dbmediaScannerCache);
        } catch (e) {
          this._debugFailure(this.dbmediaScannerCache);
          throw e;
        }
      })(),
      (async () => {
        try {
          await this.createSchemaCreateTables(this.dbplaylist);
          this._debugSuccess(this.dbplaylist);
        } catch (e) {
          this._debugFailure(this.dbplaylist);
          throw e;
        }
      })(),
      (async () => {
        try {
          await this.createSchemaCreateTables(this.dbextra);
          this._debugSuccess(this.dbextra);
        } catch (e) {
          this._debugFailure(this.dbextra);
          throw e;
        }
      })(),
    ]);

    this.ready = true;

    return this;
  }

  //   async beginTransaction(): Promise<void> {
  //     if (this.pool) {
  //       this.client = await this.pool.connect();
  //       await super.beginTransaction();
  //     }
  //   }

  //   async commitTransaction(): Promise<void> {
  //     if (this.client) {
  //       try {
  //         await super.commitTransaction();
  //       } finally {
  //         this.client.release();
  //         this.client = undefined;
  //       }
  //     }
  //   }

  //   async rollbackTransaction(): Promise<void> {
  //     if (this.client) {
  //       try {
  //         await super.rollbackTransaction();
  //       } finally {
  //         this.client.release();
  //         this.client = undefined;
  //       }
  //     }
  //   }

  /**
   *
   * @param sql -
   * @param columns - array of names of outputted columns
   * @param params
   */
  protected async execQuery(
    sql: string,
    ...params: unknown[]
  ): Promise<Record<string, unknown>[]> {
    const res = await this.knex.raw(sql, params as Knex.RawBinding) as IPostgresRunReturn;
    return res.rows;
  }

  // to make "raw" spyable
  private async _rawExecRetID(
    sql: string,
    bindings: readonly Knex.RawBinding[]
  ): Promise<Knex.Raw<IPostgresRunReturn>> {
    return await this.knex.raw(sql, bindings as Knex.RawBinding);
  }

  protected async execRetID(
    id: string,
    sql: string,
    ...params: unknown[]
  ): Promise<number> {
    const res: IPostgresRunReturn = await this._rawExecRetID(
      `${sql} RETURNING ${id}`,
      params as Knex.RawBinding[]
    );

    if (res && res.rowCount === 1) {
      return res.rows[0][id.toLowerCase()] as number;
    } else throw new MissingLastIdError("Row id unavailable");
  }

  protected async execRetVoid(sql: string, ...params: unknown[]): Promise<void> {
    await this.knex.raw(sql, params as Knex.RawBinding);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected getSQLParameter(index: number): string {
    return `?`;
  }


  protected getTotalCountColumnOrdering(): string {
    return "ASC"
  }

  protected getTotalCountRowColumnValue(tabInfo: ITabInfo[] | undefined, colName: string): string {
    let val;

    const valuesMapNoSchema = {
      "MediaInfo5": {
        "folder": "''",
      }
    };

    const valuesMap = {
      [this.dbcldb.name]: {
        [this.dbcldb.creation_info.name]: {
          "creationName": "''",
          "projectPath": "''",
          "description": "''",
          "modifyDate": "'1970-01-01'",
        },
        [this.dbcldb.face_info.name]: {

        },
        [this.dbcldb.group_info.name]: {
          "mediaName": "''",
          "addDate": "'1970-01-01'",
          "modifyDate": "'1970-01-01'",
          "mediaDate": "'1970-01-01'",
          "orderType": "''",
          "place": "''",
          "description": "''",
          "custom": "",
          "baseMediaName": "''",
        },
        [this.dbcldb.group_order_info.name]: {
          "orders": "''",
        },
        [this.dbcldb.media_info.name]: {
          "mediaName": "''",
          "description": "''",
          "mediaDate": "'1970-01-01'",
          "addDate": "'1970-01-01'",
          "modifyDate": "'1970-01-01'",
          "playDate": "'1970-01-01'",
          "protected": "'FALSE'",
          "videoMeta": "''",
          "title": "''",
          "artist": "''",
          "genre": "''",
          "albumTitle": "''",
          "albumArtist": "''",
          "composer": "''",
          "bUploadFlicker": "FALSE",
          "bUploadFacebook": "FALSE",
          "bUploadYouTube": "FALSE",
          "stereoType": "''",
          "custom": "''",
          "bAlbumArt": "FALSE",
        },
        [this.dbcldb.order_info.name]: {
          "orders": "''",
        },
        [this.dbcldb.person_info.name]: {
          "birthday": "'1970-01-01'",
        },
      },
      [this.dbextra.name]: {
        [this.dbextra.moviegrouptype.name]: {
          "name": "''",
          "description": "''",
        },
        [this.dbextra.moviegrouptypemoviegroup.name]: {

        },
      },
      [this.dbmediaScannerCache.name]: {
        [this.dbmediaScannerCache.mtcache_movie_scan_context.name]: {
          "folder": "''",
          "filename": "''",
          "isFiltered": "FALSE",
        },
        [this.dbmediaScannerCache.mtcache_music_scan_context.name]: {
          "folder": "''",
          "filename": "''",
          "isFiltered": "FALSE",
        },
        [this.dbmediaScannerCache.mtcache_photo_scan_context.name]: {
          "folder": "''",
          "filename": "''",
          "isFiltered": "FALSE",
        },
        [this.dbmediaScannerCache.mtcache_video_scan_context.name]: {
          "folder": "''",
          "filename": "''",
          "isFiltered": "FALSE",
        },
        [this.dbmediaScannerCache.postscan_movie_scan_context.name]: {
          "folder": "''",
          "filename": "''",
        },
        [this.dbmediaScannerCache.postscan_music_scan_context.name]: {
          "folder": "''",
          "filename": "''",
        },
        [this.dbmediaScannerCache.postscan_photo_scan_context.name]: {
          "folder": "''",
          "filename": "''",
        },
        [this.dbmediaScannerCache.postscan_video_scan_context.name]: {
          "folder": "''",
          "filename": "''",
        },
      },
      [this.dbmoviemedia.name]: {
        [this.dbmoviemedia.media_info.name]: {
          "modifyDate": "'1970-01-01'",
          "releaseDate": "'1970-01-01'",
          "isMovieFolder": "FALSE",
          "stereoType": "''",
          "title": "''",
          "playDate": "'1970-01-01'",
          "infoFilePath": "''",
          "description": "''",
          "studio": "''",
          "genre": "''",
          "addDate": "'1970-01-01'",
          "mediaFullPath": "''",
          "protected": "FALSE",
          "_id": "''",
        },
      },
      [this.dbplaylist.name]: {
        [this.dbplaylist.playiteminfo.name]: {
          "mediaTitle": "''",
          "mediaID": "''",
        },
        [this.dbplaylist.playlistinfo.name]: {
          "name": "''",
          "addDate": "'1970-01-01'",
          "mediaDate": "'1970-01-01'",
          "modifyDate": "'1970-01-01'",
          "place": "''",
          "description": "''",
          "custom": "''",
        },
      }
    };

    const valuesMapAlias = {
      "mid": "''",
    };  

    if (tabInfo) {
      for(const tabinfoElem of tabInfo) {
        if(tabinfoElem.schema !== undefined) {
          const schemaObj = valuesMap[tabinfoElem.schema];
          const tabObj = schemaObj[tabinfoElem.table];

          val = tabObj[colName as keyof typeof tabObj];  
        }
        else {
          const tabObj = valuesMapNoSchema[tabinfoElem.table as keyof typeof valuesMapNoSchema];

          val = tabObj[colName as keyof typeof tabObj];
        }

        if(val !== undefined) break;
      }      
    }
    else { // when alias
      val = valuesMapAlias[colName as keyof typeof valuesMapAlias];
    }

    return typeof val === "string" ? val : "0";
  }

  //=====================
  static count: number;
  static armReport(count: number): void {
    DBDataMovieManagerPostgres.count = count;
  }

  //=====================
  async initMoviesTable(): Promise<void> {
    await this.clearTable(this.dbmoviemedia.media_info);

    /* 001 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Star Wars: Episode IV - New Hope, A (1977)`,
        `C:\\Movies\\Star Wars; Episode IV - A New Hope (1977)\\Star Wars.Episode.IV.A.New.Hope.(1977).mkv`,
      ]
    );
    /* 002 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Star Wars: Episode V - Empire Strikes Back, The (1980)`,
        `C:\\Movies\\Star Wars; Episode V - The Empire Strikes Back (1980)\\Star.Wars.Episode.V.The.Empire.Strikes.Back.(1980).mkv`,
      ]
    );
    /* 003 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Star Wars: Episode VI - Return of the Jedi (1983)`,
        `C:\\Movies\\Star Wars; Episode VI - Return of the Jedi (1983)\\Star.Wars.Episode.VI.Return.of.the.Jedi.(1983).mkv`,
      ]
    );
    /* 004 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Star Wars: Episode I - Phantom Menace, The (1999)`,
        `C:\\Movies\\Star Wars; Episode I - The Phantom Menace (1999)\\Star.Wars.Episode.I.The.Phantom.Menace.(1999).mkv`,
      ]
    );
    /* 005 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Star Wars: Episode II - Attack of the Clones (2002)`,
        `C:\\Movies\\Star Wars; Episode II - Attack of the Clones (2002)\\Star.Wars.Episode.II.Attack.of.the.Clones.(2002).mkv`,
      ]
    );
    /* 006 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Star Wars: Episode III - Revenge of the Sith (2005)`,
        `C:\\Movies\\Star Wars; Episode III - Revenge of the Sith (2005)\\Star.Wars.Episode.III.Revenge.of.the.Sith.(2005).mkv`,
      ]
    );

    /* 007 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Matrix (1999)`,
        `C:\\Movies\\Matrix, The (1999)\\The.Matrix.(1999).mkv`,
      ]
    );
    /* 008 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Matrix Reloaded (2003)`,
        `C:\\Movies\\Matrix Reloaded, The (2003)\\The.Matrix.Reloaded.(2003).mkv`,
      ]
    );
    /* 009 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Matrix Revolutions (2003)`,
        `C:\\Movies\\Matrix Revolutions, The (2003)\\The.Matrix.Revolutions.(2003).mkv`,
      ]
    );
    /* 010 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Animatrix (2003)`,
        `C:\\Movies\\Animatrix, The (2003)\\The.Animatrix.(2003).mkv`,
      ]
    );

    /* 011 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Alien (1979)`, `C:\\Movies\\Alien (1979)\\Alien.(1979).mkv`]
    );
    /* 012 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Aliens (1986)`, `C:\\Movies\\Aliens (1986)\\Aliens.(1986).mkv`]
    );
    /* 013 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Alien 3 (1992)`, `C:\\Movies\\Alien 3 (1992)\\Alien.3.(1992).mkv`]
    );
    /* 014 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Alien: Resurrection (1997)`,
        `C:\\Movies\\Alien; Resurrection (1997)\\Alien.Resurrection.(1997).mkv`,
      ]
    );

    /* 015 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Raiders of the Lost Ark (1981)`,
        `C:\\Movies\\Raiders of the Lost Ark (1981)\\Raiders.of.the.Lost.Ark.(1981).mkv`,
      ]
    );
    /* 016 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Indiana Jones and the Temple of Doom (1984)`,
        `C:\\Movies\\Indiana Jones and the Temple of Doom (1984)\\Indiana.Jones.and.the.Temple.of.Doom.(1984).mkv`,
      ]
    );
    /* 017 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Indiana Jones and the Last Crusade (1989)`,
        `C:\\Movies\\Indiana Jones and the Last Crusade (1989)\\Indiana.Jones.and.the.Last.Crusade.(1989).mkv`,
      ]
    );
    /* 018 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Indiana Jones and the Kingdom of the Crystal Skull (2008)`,
        `C:\\Movies\\Indiana Jones and the Kingdom of the Crystal Skull (2008)\\Indiana.Jones.and.the.Kingdom.of.the.Crystal.Skull.(2008).mkv`,
      ]
    );

    /* 019 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Terminator (1984)`,
        `C:\\Movies\\Terminator, The (1984)\\The.Terminator.(1984).mkv`,
      ]
    );
    /* 020 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Terminator 2: Judgment Day (1991)`,
        `C:\\Movies\\Terminator 2; Judgment Day (1991)\\Terminator.2.Judgment.Day.(1991).mkv`,
      ]
    );
    /* 021 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Terminator 3: Rise of the Machines (2003)`,
        `C:\\Movies\\Terminator 3; Rise of the Machines (2003)\\Terminator.3.Rise.of.the.Machines.(2003).mkv`,
      ]
    );
    /* 022 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Terminator Salvation (2009)`,
        `C:\\Movies\\Terminator Salvation (2009)\\Terminator.Salvation.(2009).mkv`,
      ]
    );

    /* 023 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Moulin Rouge! (2001)`,
        `C:\\Movies\\Moulin Rouge (2001)\\Moulin.Rouge.(2001).mkv`,
      ]
    );
    /* 024 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Romeo + Juliet (1996)`,
        `C:\\Movies\\Romeo Juliet (1996)\\Romeo.Juliet.(1996).mkv`,
      ]
    );

    /* 025 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Batman Forever (1995)`,
        `C:\\Movies\\Batman Forever (1995)\\Batman.Forever.(1995).mkv`,
      ]
    );
    /* 026 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Batman & Robin (1997)`,
        `C:\\Movies\\Batman Robin (1997)\\Batman.Robin.(1997).mkv`,
      ]
    );

    /* 027 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Chronicles of Narnia: The Lion, the Witch and the Wardrobe (2005)`,
        `C:\\Movies\\Chronicles of Narnia, The; Lion, the Witch and the Wardrobe, The (2005)\\The.Chronicles.of.Narnia.The.Lion.the.Witch.and.the.Wardrobe.(2005).mkv`,
      ]
    );
    /* 028 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Chronicles of Narnia: Prince Caspian (2008)`,
        `C:\\Movies\\Chronicles of Narnia, The; Prince Caspian (2008)\\The.Chronicles.of.Narnia.Prince.Caspian.(2008).mkv`,
      ]
    );

    /* 029 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Resident Evil (2002)`,
        `C:\\Movies\\Resident Evil (2002)\\Resident.Evil.(2002).mkv`,
      ]
    );
    /* 030 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Resident Evil: Apocalypse (2004)`,
        `C:\\Movies\\Resident Evil; Apocalypse (2004)\\Resident.Evil.Apocalypse.(2004).mkv`,
      ]
    );
    /* 031 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Resident Evil: Extinction (2007)`,
        `C:\\Movies\\Resident Evil; Extinction (2007)\\Resident.Evil.Extinction.(2007).mkv`,
      ]
    );

    /* 032 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Lord of the Rings (1978)`,
        `C:\\Movies\\Lord of the Rings, The (1978)\\The.Lord.of.the.Rings.(1978).mkv`,
      ]
    );
    /* 033 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Lord of the Rings: The Fellowship of the Ring (2001)`,
        `C:\\Movies\\Lord of the Rings, The; Fellowship of the Ring, The (2001)\\The.Lord.of.the.Rings.The.Fellowship.of.the.Ring.(2001).mkv`,
      ]
    );
    /* 034 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Lord of the Rings: The Two Towers (2002)`,
        `C:\\Movies\\Lord of the Rings, The; Two Towers, The (2002)\\The.Lord.of.the.Rings.The.Two.Towers.(2002).mkv`,
      ]
    );
    /* 035 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Lord of the Rings: The Return of the King (2003)`,
        `C:\\Movies\\Lord of the Rings, The; Return of the King, The (2003)\\The Lord of the Rings: The Return of the King (2003).mkv`,
      ]
    );

    /* 036 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Mad Max 2: The Road Warrior (1981)`,
        `C:\\Movies\\Mad Max 2; Road Warrior, The (1981)\\Mad.Max.2.The.Road.Warrior.(1981).mkv`,
      ]
    );
    /* 037 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Mad Max Beyond Thunderdome (1985)`,
        `C:\\Movies\\Mad Max Beyond Thunderdome (1985)\\Mad.Max.Beyond.Thunderdome.(1985).mkv`,
      ]
    );

    /* 038 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Lethal Weapon 3 (1992)`,
        `C:\\Movies\\Lethal Weapon 3 (1992)\\Lethal.Weapon.3.(1992).mkv`,
      ]
    );
    /* 039 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Lethal Weapon 4 (1998)`,
        `C:\\Movies\\Lethal Weapon 4 (1998)\\Lethal.Weapon.4.(1998).mkv`,
      ]
    );

    /* 040 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Contact (1997)`, `C:\\Movies\\Contact (1997)\\Contact.(1997).mkv`]
    );
    /* 041 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Outland (1981)`, `C:\\Movies\\Outland (1981)\\Outland.(1981).mkv`]
    );
    /* 042 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Executive Decision (1996)`,
        `C:\\Movies\\Executive Decision (1996)\\Executive.Decision.(1996).mkv`,
      ]
    );
    /* 043 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Air Force One (1997)`,
        `C:\\Movies\\Air Force One (1997)\\Air.Force.One.(1997).mkv`,
      ]
    );
    /* 044 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Conan the Barbarian (1982)`,
        `C:\\Movies\\Conan the Barbarian (1982)\\Conan.the.Barbarian.(1982).mkv`,
      ]
    );
    /* 045 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Soldier (1998)`, `C:\\Movies\\Soldier (1998)\\Soldier.(1998).mkv`]
    );
    /* 046 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Skeleton Key (2005)`,
        `C:\\Movies\\Skeleton Key, The (2005)\\The.Skeleton.Key.(2005).mkv`,
      ]
    );
    /* 047 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Quiz Show (1994)`, `C:\\Movies\\Quiz Show (1994)\\Quiz.Show.(1994).mkv`]
    );
    /* 048 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Dirty Harry (1971)`,
        `C:\\Movies\\Dirty Harry (1971)\\Dirty.Harry.(1971).mkv`,
      ]
    );
    /* 049 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Good, the Bad and the Ugly (1966)`,
        `C:\\Movies\\Good, the Bad and the Ugly, The (1966)\\The.Good.the.Bad.and.the.Ugly.(1966).mkv`,
      ]
    );
    /* 050 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Æon Flux (2005)`, `C:\\Movies\\Aeon Flux (2005)\\Aeon.Flux.(2005).mkv`]
    );
    /* 051 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Ultraviolet (2006)`,
        `C:\\Movies\\Ultraviolet (2006)\\Ultraviolet.(2006).mkv`,
      ]
    );
    /* 052 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Fifth Element (1997)`,
        `C:\\Movies\\Fifth Element, The (1997)\\The.Fifth.Element.(1997).mkv`,
      ]
    );
    /* 053 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Poltergeist (1982)`,
        `C:\\Movies\\Poltergeist (1982)\\Poltergeist.(1982).mkv`,
      ]
    );
    /* 054 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Apollo 13 (1995)`, `C:\\Movies\\Apollo 13 (1995)\\Apollo.13.(1995).mkv`]
    );
    /* 055 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Mission to Mars (2000)`,
        `C:\\Movies\\Mission to Mars (2000)\\Mission.to.Mars.(2000).mkv`,
      ]
    );
    /* 056 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Red Planet (2000)`,
        `C:\\Movies\\Red Planet (2000)\\Red.Planet.(2000).mkv`,
      ]
    );
    /* 057 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Carrie (1976)`, `C:\\Movies\\Carrie (1976)\\Carrie.(1976).mkv`]
    );
    /* 058 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Rose Red`, `C:\\Movies\\Rose Red (2002)\\Rose.Red.(2002).mkv`]
    );
    /* 059 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Snake Eyes (1998)`,
        `C:\\Movies\\Snake Eyes (1998)\\Snake.Eyes.(1998).mkv`,
      ]
    );
    /* 060 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Starship Troopers (1997)`,
        `C:\\Movies\\Starship Troopers (1997)\\Starship.Troopers.(1997).mkv`,
      ]
    );
    /* 061 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Twister (1996)`, `C:\\Movies\\Twister (1996)\\Twister.(1996).mkv`]
    );
    /* 062 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`I, Robot (2004)`, `C:\\Movies\\I, Robot (2004)\\I.Robot.(2004).mkv`]
    );
    /* 063 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Dark City (1998)`, `C:\\Movies\\Dark City (1998)\\Dark.City.(1998).mkv`]
    );
    /* 064 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Speed (1994)`, `C:\\Movies\\Speed (1994)\\Speed.(1994).mkv`]
    );
    /* 065 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Thirteenth Floor (1999)`,
        `C:\\Movies\\Thirteenth Floor, The (1999)\\The.Thirteenth.Floor.(1999).mkv`,
      ]
    );
    /* 066 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Se7en (1995)`, `C:\\Movies\\Se7en (1995)\\Se7en.(1995).mkv`]
    );
    /* 067 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Shrek (2001)`, `C:\\Movies\\Shrek (2001)\\Shrek.(2001).mkv`]
    );
    /* 068 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Quick and the Dead (1995)`,
        `C:\\Movies\\Quick and the Dead, The (1995)\\The.Quick.and.the.Dead.(1995).mkv`,
      ]
    );
    /* 069 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Eraser (1996)`, `C:\\Movies\\Eraser (1996)\\Eraser.(1996).mkv`]
    );
    /* 070 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Total Recall (1990)`,
        `C:\\Movies\\Total Recall (1990)\\Total.Recall.(1990).mkv`,
      ]
    );
    /* 071 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Sphere (1998)`, `C:\\Movies\\Sphere (1998)\\Sphere.(1998).mkv`]
    );
    /* 072 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `End of Days (1999)`,
        `C:\\Movies\\End of Days (1999)\\End.of.Days.(1999).mkv`,
      ]
    );
    /* 073 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Predator (1987)`, `C:\\Movies\\Predator (1987)\\Predator.(1987).mkv`]
    );
    /* 074 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Die Hard (1988)`, `C:\\Movies\\Die Hard (1988)\\Die.Hard.(1988).mkv`]
    );
    /* 075 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The 6th Day (2000)`,
        `C:\\Movies\\6th Day (2000), The\\The.6th.Day.(2000).mkv`,
      ]
    );
    /* 076 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Equilibrium (2002)`,
        `C:\\Movies\\Equilibrium (2002)\\Equilibrium.(2002).mkv`,
      ]
    );
    /* 077 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Demolition Man (1993)`,
        `C:\\Movies\\Demolition Man (1993)\\Demolition.Man.(1993).mkv`,
      ]
    );
    /* 078 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`The Fog (1980)`, `C:\\Movies\\Fog, The (1980)\\The.Fog.(1980).mkv`]
    );
    /* 079 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Christine (1983)`, `C:\\Movies\\Christine (1983)\\Christine.(1983).mkv`]
    );
    /* 080 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Thing (1982)`,
        `C:\\Movies\\Thing, The (1982)\\The.Thing.(1982).mkv`,
      ]
    );
    /* 081 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `Village of the Damned (1995)`,
        `C:\\Movies\\Village of the Damned (1995)\\Village.of.the.Damned.(1995).mkv`,
      ]
    );
    /* 082 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Vampires (1998)`, `C:\\Movies\\Vampires (1998)\\Vampires.(1998).mkv`]
    );
    /* 083 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Messenger: The Story of Joan of Arc (1999)`,
        `C:\\Movies\\Messenger; The Story of Joan of Arc, The (1999)\\The.Messenger.The.Story.of.Joan.of.Arc.(1999).mkv`,
      ]
    );
    /* 084 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Stealth (2005)`, `C:\\Movies\\Stealth (2005)\\Stealth.(2005).mkv`]
    );
    /* 085 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Next (2007)`, `C:\\Movies\\Next (2007)\\Next.(2007).mkv`]
    );
    /* 086 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [`Maverick (1994)`, `C:\\Movies\\Maverick (1994)\\Maverick.(1994).mkv`]
    );
    /* 087 */ await this.addMovie(
      undefined,
      undefined,
      [`title`, `mediaFullPath`],
      [
        `The Perfect Storm (2000)`,
        `C:\\Movies\\Perfect Storm, The (2000)\\The.Perfect.Storm.(2000).mkv`,
      ]
    );
  }
}
