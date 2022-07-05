import { DataSources } from "apollo-server-core/dist/graphqlOptions";
import { MoviesDataSource } from "../datasources/movies-data-source";
import { IBigInt } from "./bigint";
import {
  buildConnectionResponse,
  IConnectionArgs,
  IConnectionResolver,
  translateConnectionArgs,
} from "./connection";

// export interface IPlayItemInfo {
//   id: number;
//   type: number;
//   playlistID: number;
//   mediaTitle: string;
//   mediaID: string;
//   listOrder: number;
// }

export enum Visibility {
  INVISIBLE = 0,
  VISIBLE = 1,
}

interface IMovieGroup {
  dummyxx: number;
}

export interface IMovie {
  _id: string;
  mediaFullPath: string;
  title: string;
  description: string;
  genre: string;
  length: IBigInt;
  mediaType: number;
  mediaDuration: bigint;
  mediaSize: bigint;
  mediaRating: number;
  mediaResume: bigint;
  resolutionX: number;
  resolutionY: number;
  aspectRatioX: number;
  aspectRatioY: number;
  thumbnailResolutionX: number;
  thumbnailResolutionY: number;
  playCount: number;
  stereoType: string;
  infoFilePath: string;
  isMovieFolder: boolean;
  visible: Visibility;
  orientation: number;
  onlineInfoVisible: number;
  releaseDate: string;
  addDate: string;
  modifyDate: string;
  playDate: string;
  studio: string;
  protected: boolean;
  movieGroups: IMovieGroup[];
}

export interface IIDArgs {
  _id: string;
}

export interface IDataSources {
  moviesDataSource: MoviesDataSource;
}

export interface IContext {
  dataSources: IDataSources;
}

const movie_ex_column_names = [
  "description",
  "genre",
  "length",
  "mediatype",
  "mediaDuration",
  "mediaSize",
  "mediaRating",
  "mediaResume",
  "resolutionX",
  "resolutionY",
  "aspectratioX",
  "aspectRatioY",
  "thumbnailResolutionX",
  "thumbnailResolutionY",
  "playCount",
  "stereoType",
  "infoFilePath",
  "isMovieFolder",
  "visible",
  "orientation",
  "onlineInfoVisible",
  "releaseDate",
  "addDate",
  "modifyDate",
  "playDate",
  "studio",
  "protected",
];

interface IArrayParams {
  column_names: string[];
  column_values: unknown[];
}

const _objParams2ArrayParams = (obj: Record<string, unknown>): IArrayParams => {
  const column_names: string[] = [];
  const column_values: unknown[] = [];

  if (obj) {
    for (const prop in obj) {
      const val = obj[prop];

      if (typeof val === "object") {
        const val2 = val as Record<string, unknown>;

        if (val2["bigIntStr"] !== undefined) {
          if (typeof val2["bigIntStr"] === "string") {
            const val3 = BigInt(val2["bigIntStr"]);

            column_names.push(prop);
            column_values.push(val3);
          } else {
            throw new Error("bigIntStr is not a string");
          }
        } else {
          throw new Error("Object instead of a primitive value as a value");
        }
      } else {
        column_names.push(prop);
        column_values.push(val);
      }
    }
  }

  return { column_names, column_values };
};

// name of property is always lower case; value coresponds to field name
const _transform2ValidFields = (
  rows: Record<string, unknown>[],
  trans_data: Record<string, string>
) => {
  if (rows) {
    rows.forEach((row) => {
      for (const row_prop in row) {
        // checj if property exists in "trans_data"
        const fieldName = trans_data[row_prop.toLocaleLowerCase()];

        if (fieldName) {
          // check if names are different
          if (row_prop.localeCompare(fieldName) !== 0) {
            const val = row[row_prop];

            delete row[row_prop]; // delete property
            row[fieldName] = val; // add proerty with "fieldName" and old value
          }
        }
      }
    });
  }
};

const _createTranslateData = (fieldNames: string[]) => {
  const obj: Record<string, string> = {};

  fieldNames.forEach((fieldName) => {
    obj[fieldName.toLocaleLowerCase()] = fieldName;
  });

  return obj;
};

const movies_fields_trans_data = _createTranslateData([
  "_id",
  "mediaFullPath",
  "title",
  "description",
  "genre",
  "length",
  "mediaType",
  "mediaDuration",
  "mediaSize",
  "mediaRating",
  "mediaResume",
  "resolutionX",
  "resolutionY",
  "aspectRatioX",
  "aspectRatioY",
  "thumbnailResolutionX",
  "thumbnailResolutionY",
  "playCount",
  "stereoType",
  "infoFilePath",
  "isMovieFolder",
  "visible",
  "orientation",
  "onlineInfoVisible",
  "releaseDate",
  "addDate",
  "modifyDate",
  "playDate",
  "studio",
  "protected",
]);

export const resolvers = {
  Visibility: {
    INVISIBLE: Visibility.INVISIBLE,
    VISIBLE: Visibility.VISIBLE,
  },

  BigInt: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    bigIntStr: (parent: unknown, args: unknown, context: IContext) => {
      const val = parent as bigint;
      return val.toString();
    },
  },

  Query: {
    movies: async (
      parent: unknown,
      { first, after, last, before, offset }: IConnectionArgs,
      context: IContext
    ): Promise<IConnectionResolver<Partial<IMovie>>> => {
      const { limit, offset: offset2 } = translateConnectionArgs(
        first,
        after,
        last,
        before,
        offset
      );

      let startOffset = offset2 !== undefined ? offset2 : 0;

      const response = await context.dataSources.moviesDataSource.getMovies(
        undefined,
        undefined,
        movie_ex_column_names,
        limit,
        offset2
      );

      // special handling when it is unknown what rows are the last ones
      if (last !== undefined) {
        if (last < response.rows.length) {
          startOffset += response.rows.length - last;
          response.rows = response.rows.slice(-last);
        }
      }

      _transform2ValidFields(response.rows, movies_fields_trans_data);

      // translate "response.rows" to "edges"
      return buildConnectionResponse(response, startOffset);
    },
    movie: async (parent: unknown, { _id }: IIDArgs, context: IContext) => {
      const response = await context.dataSources.moviesDataSource.getMovies(
        undefined,
        _id,
        movie_ex_column_names
      );

      _transform2ValidFields(response.rows, movies_fields_trans_data);
      return response.rows.length === 1 ? response.rows[0] : null;
    },
    movieGroups: (parent: unknown) => {
      // TODO:
    },
    movieGroup: (parent: unknown, { _id }: IIDArgs) => {
      // TODO:
    },
    groupTypes: (parent: unknown) => {
      // TODO:
    },
    groupType: (parent: unknown, { _id }: IIDArgs) => {
      // TODO:
    },
  },

  Mutation: {
    addMovie: async (
      parent: unknown,
      { movieInfo }: { movieInfo: Record<string, unknown> },
      context: IContext
    ): Promise<string> => {
      const { column_names, column_values } = _objParams2ArrayParams(movieInfo);

      return await context.dataSources.moviesDataSource.addMovie(
        undefined,
        undefined,
        column_names,
        column_values
      );
    },
    updateMovie: async (
      parent: unknown,
      { _id, movieInfo }: { _id: string; movieInfo: Record<string, unknown> },
      context: IContext
    ): Promise<boolean> => {
      const { column_names, column_values } = _objParams2ArrayParams(movieInfo);

      await context.dataSources.moviesDataSource.updateMovie(
        _id,
        column_names,
        column_values
      );

      return true;
    },
    deleteMovie: async (
      parent: unknown,
      { _id }: { _id: string },
      context: IContext
    ): Promise<boolean> => {
      await context.dataSources.moviesDataSource.deleteMovie(_id);
      return true;
    },
  },
};
