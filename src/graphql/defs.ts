import { gql } from "apollo-server-core";

export interface IPlayItemInfo {
  id: number;
  type: number;
  playlistID: number;
  mediaTitle: string;
  mediaID: string;
  listOrder: number;
}

export enum Visibility {
  INVISIBLE = 0,
  VISIBLE = 1,
}

export interface IPlayListInfo {
  id: number;
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

export interface IID {
  id: number;
}


//======================================================
export const typeDefs = gql`
  type PlayItemInfo {
    id: ID!
    type: Int!
    mediaTitle: String!
    mediaID: String!
    listOrder: Int!
    playListInfo: PlayListInfo!
  }

  enum Visibility {
    INVISIBLE
    VISIBLE
  }

  type PlayListInfo {
    id: ID!
    type: Int!
    name: String!
    addDate: String!
    mediaDate: String!
    modifyDate: String!
    place: String
    description: String
    visible: Visibility!
    custom: String
    playItemInfos: [PlayItemInfo!]!
  }

  type Query {
    playItemInfos: [PlayItemInfo!]!
    playListInfos: [PlayListInfo!]!
    playItemInfo(id: ID!): PlayItemInfo
    playListInfo(id: ID!): PlayListInfo
  }
`;

export const resolvers = {
  Visibility: {
    INVISIBLE: Visibility.INVISIBLE,
    VISIBLE: Visibility.VISIBLE,
  },

  Query: {
    playItemInfos: () => {
//      return playItemInfo;
    },
    playListInfos: () => {
//      return playListInfo;
    },
    playItemInfo: (parent: unknown, { id }: IID) => {
      // return playItemInfo.find((item) => item.id === +id);
    },
    playListInfo: (parent: unknown, { id }: IID) => {
      // return playListInfo.find((item) => item.id === +id);
    },
  },

  PlayItemInfo: {
    playListInfo: (parent: IPlayItemInfo) => {
      // return playListInfo.find((item) => item.id === parent.playlistID);
    },
  },

  PlayListInfo: {
    playItemInfos: (parent: IPlayListInfo) => {
      // return playItemInfo.filter((item) => item.playlistID === parent.id);
    },
  },
};

