import { DBTable } from "./db-table";
import { DB } from "./db-db";
import { AppPlatformType } from '../common/types';

export class DBTablePlayListInfo extends DBTable {
    appPlatform: AppPlatformType;

    constructor(db: DB, appPlatform: AppPlatformType) {
        super(db, 'PlayListInfo');
        this.appPlatform = appPlatform;
    }

    getSQLCreateText(useTableSchema = true, useIndexSchema = true, useIndexTableSchema = false): string[] {
        const aSqlText: string[] = [];

        if (this.appPlatform === 'postgres') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `_id SERIAL PRIMARY KEY,` +
                `type INTEGER NOT NULL,` +
                `name TEXT NOT NULL,` +
                `addDate TIMESTAMP NOT NULL,` +
                `mediaDate TIMESTAMP NOT NULL,` +
                `modifyDate TIMESTAMP NOT NULL,` +
                `place TEXT DEFAULT '',` +
                `description TEXT DEFAULT '',` +
                `visible INTEGER DEFAULT 1,` +
                `custom TEXT` +
                `)`;

            aSqlText.push(sqlText);
        }
        else if (this.appPlatform === 'cyberlink') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `_id INTEGER PRIMARY KEY,` +
                `type INTEGER NOT NULL,` +
                `name TEXT NOT NULL,` +
                `addDate TIMESTAMP NOT NULL,` +
                `mediaDate TIMESTAMP NOT NULL,` +
                `modifyDate TIMESTAMP NOT NULL,` +
                `place TEXT DEFAULT '',` +
                `description TEXT DEFAULT '',` +
                `visible INTEGER DEFAULT 1,` +
                `custom TEXT` +
                `)`;

            aSqlText.push(sqlText);
        }

        if ((this.appPlatform === 'postgres') || (this.appPlatform === 'cyberlink')) {
            const indexName = 'PLAYLISTINFO_NAME_INDEX';
            const sqlIndexText = `CREATE INDEX IF NOT EXISTS ${useIndexSchema ? this.getExtendedName(indexName) : indexName} ` +
                `ON ${useIndexTableSchema ? this.getExtendedName() : this.name} (type, name)`;

            aSqlText.push(sqlIndexText);
        }

        return aSqlText;
    }
}

