import Table from "cli-table3";
import { logger } from "@/utils/logger";

export const generateObjectsTable = (data: object[]) => {
  var table = new Table({
    style: {
      head: [], // no colors in headers
      border: [], // no colors in border
    },
  });

  const tableData = data.map((item) => Object.values(item));
  table.push(...tableData);

  const tableString = table.toString();
  logger.debug({ table: tableString }, "Generated table");

  return tableString;
};

export const generateTable = (data: string[]) => {
  var table = new Table({
    style: {
      head: [], // no colors in headers
      border: [], // no colors in border
    },
  });

  const tableData = data.map((item) => [item]);
  table.push(...tableData);

  const tableString = table.toString();
  logger.debug({ table: tableString }, "Generated table");

  return tableString;
};
