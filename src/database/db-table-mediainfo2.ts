import { DBTable } from "./db-table";
import { DB } from "./db-db";
import { AppPlatformType } from '../common/types';

export class DBTableMediaInfo2 extends DBTable {
    appPlatform: AppPlatformType;

    constructor(db: DB, appPlatform: AppPlatformType) {
        super(db, 'MediaInfo');
        this.appPlatform = appPlatform;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getSQLCreateText(useTableSchema = true, useIndexSchema = true, useIndexTableSchema = false): string[] {
        const aSqlText: string[] = [];

        if (this.appPlatform === 'postgres') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name} (` +
                `thumbnailResolutionY INTEGER,` +
                `modifyDate TIMESTAMP NOT NULL,` +
                `orientation INTEGER,` +
                `releaseDate TIMESTAMP,` +
                `visible INTEGER NOT NULL DEFAULT 1,` +
                `mediaSize BIGINT NOT NULL,` +
                `isMovieFolder BOOLEAN DEFAULT FALSE,` +
                `stereoType TEXT,` +
                `title TEXT,` +
                `OnlineInfoVisible INTEGER NOT NULL DEFAULT 1,` +
                `mediaType INTEGER NOT NULL,` +
                `resolutionY INTEGER,` +
                `resolutionX INTEGER,` +
                `playDate TIMESTAMP NOT NULL,` +
                `infoFilePath TEXT,` +
                `description TEXT,` +
                `aspectRatioY INTEGER,` +
                `aspectRatioX INTEGER,` +
                `mediaRating INTEGER,` +
                `studio TEXT,` +
                `genre TEXT,` +
                `playCount INTEGER NOT NULL DEFAULT 0,` +
                `mediaResume BIGINT DEFAULT 0,` +
                `addDate TIMESTAMP NOT NULL,` +
                `mediaFullPath TEXT,` +
                `length BIGINT DEFAULT NULL,` +
                `protected BOOLEAN DEFAULT FALSE,` +
                `mediaDuration BIGINT DEFAULT NULL,` +
                `_id TEXT PRIMARY KEY,` +
                `thumbnailResolutionX INTEGER` +
                `)`;

            aSqlText.push(sqlText);
        }
        else if (this.appPlatform === 'cyberlink') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name} (` +
                `thumbnailResolutionY INTEGER,` +
                `modifyDate TIMESTAMP NOT NULL,` +
                `orientation INTEGER,` +
                `releaseDate TIMESTAMP,` +
                `visible INTEGER NOT NULL DEFAULT 1,` +
                `mediaSize BIGINT NOT NULL,` +
                `isMovieFolder BOOLEAN DEFAULT FALSE,` +
                `stereoType TEXT,` +
                `title TEXT,` +
                `OnlineInfoVisible INTEGER NOT NULL DEFAULT 1,` +
                `mediaType INTEGER NOT NULL,` +
                `resolutionY INTEGER,` +
                `resolutionX INTEGER,` +
                `playDate TIMESTAMP NOT NULL,` +
                `infoFilePath TEXT,` +
                `description TEXT,` +
                `aspectRatioY INTEGER,` +
                `aspectRatioX INTEGER,` +
                `mediaRating INTEGER,` +
                `studio TEXT,` +
                `genre TEXT,` +
                `playCount INTEGER NOT NULL DEFAULT 0,` +
                `mediaResume BIGINT DEFAULT 0,` +
                `addDate TIMESTAMP NOT NULL,` +
                `mediaFullPath TEXT,` +
                `length BIGINT DEFAULT NULL,` +
                `protected BOOLEAN DEFAULT FALSE,` +
                `mediaDuration BIGINT DEFAULT NULL,` +
                `_id TEXT PRIMARY KEY,` +
                `thumbnailResolutionX INTEGER` +
                `)`;

            aSqlText.push(sqlText);
        }

        if ((this.appPlatform === 'postgres') || (this.appPlatform === 'cyberlink')) {
            const indexName1 = 'MEDIAINFO_TITLE_ID_INDEX';
            const sqlIndexText1 = `CREATE UNIQUE INDEX IF NOT EXISTS ${useIndexSchema ? this.getExtendedName(indexName1) : indexName1} ` +
                `ON ${useIndexTableSchema ? this.getExtendedName() : this.name} (title, _id)`;

            aSqlText.push(sqlIndexText1);

        }

        return aSqlText;
    }
}

