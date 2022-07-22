import { DataSources } from "apollo-server-core/dist/graphqlOptions";
import { MoviesDataSource } from "../datasources/movies-data-source";
import { IBigInt } from "./bigint";
import {
  buildConnectionResponse,
  decodeCursor,
  IConnectionArgs,
  IConnectionResolver,
  // translateConnectionArgs,
} from "./connection";

export enum Visibility {
  INVISIBLE = 0,
  VISIBLE = 1,
}

export interface IMovieGroup {
  _id: string;
  type: number;
  name: string;
  addDate: string;
  mediaDate: string;
  modifyDate: string;
  place: string;
  description: string;
  visible: Visibility;
  custom: string;
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

const movie_group_ex_column_names = [
  `type`,
  `name`,
  `addDate`,
  `mediaDate`,
  `modifyDate`,
  `place`,
  `description`,
  `visible`,
  `custom`,
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

const movie_groups_fields_trans_data = _createTranslateData([
  `_id`,
  `type`,
  `name`,
  `addDate`,
  `mediaDate`,
  `modifyDate`,
  `place`,
  `description`,
  `visible`,
  `custom`,
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
      const response = await context.dataSources.moviesDataSource.getMovies(
        undefined,
        undefined,
        movie_ex_column_names,
        first,
        after !== undefined ? decodeCursor(after) : undefined,
        last,
        before !== undefined ? decodeCursor(before) : undefined,
        offset
      );

      _transform2ValidFields(response.rows, movies_fields_trans_data);

      // translate "response.rows" to "edges"
      return buildConnectionResponse(
        response,
        after !== undefined,
        before !== undefined,
        ["_id", "title"]
      );
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
    movieGroups: async (
      parent: unknown,
      { first, after, last, before, offset }: IConnectionArgs,
      context: IContext
    ): Promise<IConnectionResolver<Partial<IMovieGroup>>> => {
      const response = await context.dataSources.moviesDataSource.getMovieGroups(
        undefined,
        undefined,
        movie_group_ex_column_names,
        first,
        after !== undefined ? decodeCursor(after) : undefined,
        last,
        before !== undefined ? decodeCursor(before) : undefined,
        offset
      );

      _transform2ValidFields(response.rows, movie_groups_fields_trans_data);

      // translate "response.rows" to "edges"
      return buildConnectionResponse(
        response,
        after !== undefined,
        before !== undefined,
        ["_id", "name"]
      );
    },
    movieGroup: async (parent: unknown, { _id }: IIDArgs, context: IContext) => {
      const response = await context.dataSources.moviesDataSource.getMovieGroups(
        undefined,
        parseInt(_id),
        movie_group_ex_column_names
      );

      _transform2ValidFields(response.rows, movie_groups_fields_trans_data);
      return response.rows.length === 1 ? response.rows[0] : null;
    },
    groupTypes: (parent: unknown) => {
      // TODO:
    },
    groupType: (parent: unknown, { _id }: IIDArgs) => {
      // TODO:
    },
  },

  Mutation: {
    // movies
    addMovie: async (
      parent: unknown,
      {
        mediaFullPath,
        movieInfo,
      }: { mediaFullPath: string; movieInfo: Record<string, unknown> },
      context: IContext
    ): Promise<string> => {
      const { column_names, column_values } = _objParams2ArrayParams(movieInfo);
      column_names.unshift("mediaFullPath");
      column_values.unshift(mediaFullPath);

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

      try {
        await context.dataSources.moviesDataSource.updateMovie(
          _id,
          column_names,
          column_values
        );

        return true;
      } catch (e) {
        return false;
      }
    },
    deleteMovie: async (
      parent: unknown,
      { _id }: { _id: string },
      context: IContext
    ): Promise<boolean> => {
      try {
        await context.dataSources.moviesDataSource.deleteMovie(_id);
        return true;
      } catch (e) {
        return false;
      }
    },
    // moviegroup
    addMovieGroup: async (
      parent: unknown,
      { movieGroupInfo }: { movieGroupInfo: Record<string, unknown> },
      context: IContext
    ): Promise<number> => {
      const { column_names, column_values } =
        _objParams2ArrayParams(movieGroupInfo);

      return await context.dataSources.moviesDataSource.addMovieGroup(
        undefined,
        undefined,
        column_names,
        column_values
      );
    },
    // updateMovieGroup(_id: ID!, movieGroupInfo: MovieGroupInfoInput!): Boolean!
    updateMovieGroup: async (
      parent: unknown,
      {
        _id,
        movieGroupInfo,
      }: { _id: number; movieGroupInfo: Record<string, unknown> },
      context: IContext
    ): Promise<boolean> => {
      const { column_names, column_values } =
        _objParams2ArrayParams(movieGroupInfo);

      try {
        await context.dataSources.moviesDataSource.updateMovieGroup(
          _id,
          column_names,
          column_values
        );

        return true;
      } catch (e) {
        return false;
      }
    },
    // deleteMovieGroup(_id: ID!): Boolean!
    deleteMovieGroup: async (
      parent: unknown,
      { _id }: { _id: number },
      context: IContext
    ): Promise<boolean> => {
      try {
        await context.dataSources.moviesDataSource.deleteMovieGroup(_id);

        return true;
      } catch (e) {
        return false;
      }
    },
  },
};
