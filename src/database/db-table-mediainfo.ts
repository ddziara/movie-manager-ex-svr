import { DBTable } from "./db-table";
import { DB } from "./db-db";
import { AppPlatformType } from '../common/types';

export class DBTableMediaInfo extends DBTable {
    appPlatform: AppPlatformType;

    constructor(db: DB, appPlatform: AppPlatformType) {
        super(db, 'MediaInfo');
        this.appPlatform = appPlatform;
    }

    getSQLCreateText(useTableSchema = true, useIndexSchema = true, useIndexTableSchema = false): string[] {
        const aSqlText: string[] = [];

        if (this.appPlatform === 'postgress') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `_id SERIAL PRIMARY KEY,` +
                `type INTEGER NOT NULL,` +
                `folderGroupID INTEGER NOT NULL,` +
                `mediaName TEXT,` +
                `description TEXT,` +
                `mediaSize BIGINT NOT NULL,` +
                `mediaDate TIMESTAMP NOT NULL,` +
                `addDate TIMESTAMP NOT NULL,` +
                `modifyDate TIMESTAMP NOT NULL,` +
                `playDate TIMESTAMP NOT NULL,` +
                `mediaDuration BIGINT DEFAULT NULL,` +
                `mediaResume BIGINT DEFAULT 0,` +
                `mediaRating INTEGER NOT NULL DEFAULT 0,` +
                `playCount INTEGER NOT NULL DEFAULT 0,` +
                `protected BOOLEAN NOT NULL DEFAULT FALSE,` +
                `resolutionX INTEGER,` +
                `resolutionY INTEGER,` +
                `orientation INTEGER,` +
                `aspectRatioX INTEGER,` +
                `aspectRatioY INTEGER,` +
                `videoMeta TEXT,` +
                `title TEXT,` +
                `artist TEXT,` +
                `genre TEXT,` +
                `albumTitle TEXT,` +
                `albumArtist TEXT,` +
                `composer TEXT,` +
                `year INTEGER,` +
                `trackNumber INTEGER,` +
                `trackCount INTEGER,` +
                `sampleRate INTEGER,` +
                `bitrate INTEGER,` +
                `bUploadFlicker BOOLEAN NOT NULL DEFAULT FALSE,` +
                `bUploadFacebook BOOLEAN NOT NULL DEFAULT FALSE,` +
                `bUploadYouTube BOOLEAN NOT NULL DEFAULT FALSE,` +
                `visible INTEGER NOT NULL DEFAULT 1,` +
                `stereoType TEXT,` +
                `custom TEXT,` +
                `bAlbumArt BOOLEAN NOT NULL DEFAULT FALSE,` +
                `retryTimes INTEGER NOT NULL DEFAULT 0,` +
                `thumbnailResolutionX INTEGER,` +
                `thumbnailResolutionY INTEGER` +
                `)`;

            aSqlText.push(sqlText);
        }
        else if (this.appPlatform === 'cyberlink') {
            const sqlText = `CREATE TABLE IF NOT EXISTS ${useTableSchema ? this.getExtendedName() : this.name}` +
                `(` +
                `_id INTEGER PRIMARY KEY,` +
                `type INTEGER NOT NULL,` +
                `folderGroupID INTEGER NOT NULL,` +
                `mediaName TEXT,` +
                `description TEXT,` +
                `mediaSize BIGINT NOT NULL,` +
                `mediaDate TIMESTAMP NOT NULL,` +
                `addDate TIMESTAMP NOT NULL,` +
                `modifyDate TIMESTAMP NOT NULL,` +
                `playDate TIMESTAMP NOT NULL,` +
                `mediaDuration BIGINT DEFAULT NULL,` +
                `mediaResume BIGINT DEFAULT 0,` +
                `mediaRating INTEGER NOT NULL DEFAULT 0,` +
                `playCount INTEGER NOT NULL DEFAULT 0,` +
                `protected BOOLEAN NOT NULL DEFAULT FALSE,` +
                `resolutionX INTEGER,` +
                `resolutionY INTEGER,` +
                `orientation INTEGER,` +
                `aspectRatioX INTEGER,` +
                `aspectRatioY INTEGER,` +
                `videoMeta TEXT,` +
                `title TEXT,` +
                `artist TEXT,` +
                `genre TEXT,` +
                `albumTitle TEXT,` +
                `albumArtist TEXT,` +
                `composer TEXT,` +
                `year INTEGER,` +
                `trackNumber INTEGER,` +
                `trackCount INTEGER,` +
                `sampleRate INTEGER,` +
                `bitrate INTEGER,` +
                `bUploadFlicker BOOLEAN NOT NULL DEFAULT FALSE,` +
                `bUploadFacebook BOOLEAN NOT NULL DEFAULT FALSE,` +
                `bUploadYouTube BOOLEAN NOT NULL DEFAULT FALSE,` +
                `visible INTEGER NOT NULL DEFAULT 1,` +
                `stereoType TEXT,` +
                `custom TEXT,` +
                `bAlbumArt BOOLEAN NOT NULL DEFAULT FALSE,` +
                `retryTimes INTEGER NOT NULL DEFAULT 0,` +
                `thumbnailResolutionX INTEGER,` +
                `thumbnailResolutionY INTEGER` +
                `)`;

            aSqlText.push(sqlText);
        }

        if ((this.appPlatform === 'postgress') || (this.appPlatform === 'cyberlink')) {
            const indexName1 = 'MEDIAINFO_FOLDERGROUPID_MEDIANAME_INDEX';
            const sqlIndexText1 = `CREATE INDEX IF NOT EXISTS ${useIndexSchema ? this.getExtendedName(indexName1) : indexName1} ` +
                `ON ${useIndexTableSchema ? this.getExtendedName() : this.name} (folderGroupID, mediaName)`;

            aSqlText.push(sqlIndexText1);

            const indexName2 = 'MEDIAINFO_FOLDERGROUPID_TYPE_VISIBLE_INDEX';
            const sqlIndexText2 = `CREATE INDEX IF NOT EXISTS ${useIndexSchema ? this.getExtendedName(indexName2) : indexName2} ` +
                `ON ${useIndexTableSchema ? this.getExtendedName() : this.name} (folderGroupID, type, visible)`;

            aSqlText.push(sqlIndexText2);

            const indexName3 = 'MEDIAINFO_MEDIANAME_INDEX';
            const sqlIndexText3 = `CREATE INDEX IF NOT EXISTS ${useIndexSchema ? this.getExtendedName(indexName3) : indexName3} ` +
                `ON ${useIndexTableSchema ? this.getExtendedName() : this.name} (mediaName)`;

            aSqlText.push(sqlIndexText3);
        }

        return aSqlText;
    }
}

