import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

const caFilePath = path.join(process.cwd(), "isrgrootx1.pem");

const database = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: {
    ca: fs.readFileSync(caFilePath),
    rejectUnauthorized: true, //without ca reject, no connection
    minVersion: "TLSv1.2",
  },
  //connection Pool setting
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
});

export default database;
