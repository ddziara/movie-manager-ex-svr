import { DBTable } from "./db-table";
import { DB } from "./db-db";
import { AppPlatformType } from '../common/types';

export class DBTablePlayItemInfo extends DBTable {
    appPlatform: AppPlatformType;

    constructor(db: DB, appPlatform: AppPlatformType) {
        super(db, 'PlayItemInfo');
        this.appPlatform = appPlatform;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getSQLCreateText(useTableSchema = true, useIndexSchema = true, useIndexTableSchema = false): string[] {
        const aSqlText: string[] = [];

        if (this.appPlatform === 'postgres') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `_id SERIAL PRIMARY KEY,` +
                `type INTEGER NOT NULL,` +
                `playlistID INTEGER NOT NULL,` +
                `mediaTitle TEXT NOT NULL,` +
                `mediaID TEXT NOT NULL,` +
                `listOrder INTEGER NOT NULL` +
                `)`;

            aSqlText.push(sqlText);
        }
        else if (this.appPlatform === 'cyberlink') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `_id INTEGER PRIMARY KEY,` +
                `type INTEGER NOT NULL,` +
                `playlistID INTEGER NOT NULL,` +
                `mediaTitle TEXT NOT NULL,` +
                `mediaID TEXT NOT NULL,` +
                `listOrder INTEGER NOT NULL` +
                `)`;

            aSqlText.push(sqlText);
        }

        return aSqlText;
    }
}

