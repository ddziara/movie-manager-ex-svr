import { DBTable } from "./db-table";
import { DB } from "./db-db";
import { AppPlatformType } from '../common/types';

export class DBTableMovieGroupTypeMovieGroups extends DBTable {
    appPlatform: AppPlatformType;

    constructor(db: DB, appPlatform: AppPlatformType) {
        super(db, 'MovieGroupTypeMovieGroups');
        this.appPlatform = appPlatform;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getSQLCreateText(useTableSchema = true, useIndexSchema = true, useIndexTableSchema = false): string[] {
        const aSqlText: string[] = [];

        if (this.appPlatform === 'postgress') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name} ` +
                `(` +
                `mgid SERIAL PRIMARY KEY, ` +
                `gendid INTEGER  NOT NULL ` +
                `)`;

            aSqlText.push(sqlText);
        }
        else if (this.appPlatform === 'cyberlink') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name} ` +
                `(` +
                `mgid INTEGER PRIMARY KEY, ` +
                `gendid INTEGER  NOT NULL ` +
                `)`;

            aSqlText.push(sqlText);
        }

        return aSqlText;
    }
}

