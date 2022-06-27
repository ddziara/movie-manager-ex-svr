import { DBTable } from "./db-table";
import { DB } from "./db-db";
import { AppPlatformType } from '../common/types';

export class DBTableGroupInfo extends DBTable {
    appPlatform: AppPlatformType;

    constructor(db: DB, appPlatform: AppPlatformType) {
        super(db, 'GroupInfo');
        this.appPlatform = appPlatform;
    }

    getSQLCreateText(useTableSchema = true, useIndexSchema = true, useIndexTableSchema = false): string[] {
        const aSqlText: string[] = [];

        if (this.appPlatform === 'postgress') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `_id SERIAL PRIMARY KEY,` +
                `type INTEGER NOT NULL,` +
                `mediaName TEXT NOT NULL,` +
                `addDate TIMESTAMP NOT NULL,` +
                `modifyDate TIMESTAMP NOT NULL,` +
                `mediaDate TIMESTAMP NOT NULL,` +
                `orderType TEXT NOT NULL DEFAULT "manual",` +
                `place TEXT DEFAULT "",` +
                `description TEXT DEFAULT "",` +
                `visible INTEGER DEFAULT 1,` +
                `custom TEXT,` +
                `coverID INTEGER,` +
                `baseMediaName TEXT NOT NULL` +
                `)`;

            aSqlText.push(sqlText);
        }
        else if (this.appPlatform === 'cyberlink') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `_id INTEGER PRIMARY KEY,` +
                `type INTEGER NOT NULL,` +
                `mediaName TEXT NOT NULL,` +
                `addDate TIMESTAMP NOT NULL,` +
                `modifyDate TIMESTAMP NOT NULL,` +
                `mediaDate TIMESTAMP NOT NULL,` +
                `orderType TEXT NOT NULL DEFAULT "manual",` +
                `place TEXT DEFAULT "",` +
                `description TEXT DEFAULT "",` +
                `visible INTEGER DEFAULT 1,` +
                `custom TEXT,` +
                `coverID INTEGER,` +
                `baseMediaName TEXT NOT NULL` +
                `)`;

            aSqlText.push(sqlText);
        }

        if ((this.appPlatform === 'postgress') || (this.appPlatform === 'cyberlink')) {
            const indexName1 = 'GROUPINFO_TYPE_MEDIANAME_INDEX';
            const sqlIndexText1 = `CREATE INDEX IF NOT EXISTS ${useIndexSchema ? this.getExtendedName(indexName1) : indexName1} ` +
                `ON ${useIndexTableSchema ? this.getExtendedName() : this.name} (type, mediaName)`;

            aSqlText.push(sqlIndexText1);

            const indexName2 = 'GROUPINFO_VISIBLE_INDEX';
            const sqlIndexText2 = `CREATE INDEX IF NOT EXISTS ${useIndexSchema ? this.getExtendedName(indexName2) : indexName2} ` +
                `ON ${useIndexTableSchema ? this.getExtendedName() : this.name} (visible)`;

            aSqlText.push(sqlIndexText2);
        }

        return aSqlText;
    }
}

