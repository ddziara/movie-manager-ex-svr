import { DBTable } from "./db-table";
import { DB } from "./db-db";
import { AppPlatformType } from '../common/types';

export class DBTableMovieGroupTypes extends DBTable {
    appPlatform: AppPlatformType;

    constructor(db: DB, appPlatform: AppPlatformType) {
        super(db, 'MovieGroupTypes');
        this.appPlatform = appPlatform;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getSQLCreateText(useTableSchema = true, useIndexSchema = true, useIndexTableSchema = false): string[] {
        const aSqlText: string[] = [];

        if (this.appPlatform === 'postgres') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name} ` +
                `(` +
                `_id SERIAL PRIMARY KEY, ` +
                `name TEXT NOT NULL, ` +
                `description TEXT DEFAULT '' ` +
                `)`;

            aSqlText.push(sqlText);
        }
        else if (this.appPlatform === 'cyberlink') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name} ` +
                `(` +
                `_id INTEGER PRIMARY KEY, ` +
                `name TEXT NOT NULL, ` +
                `description TEXT DEFAULT '' ` +
                `)`;

            aSqlText.push(sqlText);
        }

        if ((this.appPlatform === 'postgres') || (this.appPlatform === 'cyberlink')) {
            const indexName1 = 'MOVIEGROUPTYPES_NAME_ID_INDEX';
            const sqlIndexText1 = `CREATE UNIQUE INDEX IF NOT EXISTS ${useIndexSchema ? this.getExtendedName(indexName1) : indexName1} ` +
                `ON ${useIndexTableSchema ? this.getExtendedName() : this.name} (name, _id)`;

            aSqlText.push(sqlIndexText1);

        }

        return aSqlText;
    }
}

