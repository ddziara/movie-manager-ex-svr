import { decodeCursor, encodeCursor } from "../graphql/connection";

describe("Tesing GaphQL Connection", () => {
  test("Checking encodeCursor() and decodeCursor()", () => {
      const cursor = { _id: "MOVIE_C_SomeMovie", title: "Some Movie" };
      const cursorStr = encodeCursor(cursor);
      const cursor2 = decodeCursor(cursorStr);

      expect(cursor2).toEqual(cursor);
  })  
})