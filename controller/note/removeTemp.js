import fs from "fs"; // Use file system
import path from "path"; // Use path

// R2 is no longer needed here
// import { r2, DeleteObjectCommand } from "../../lib/r2.js";

const removeTemp = async (req, res) => {
  const { key } = req.params;

  if (!key) {
    return res.status(400).json({ error: "Missing file key" });
  }

  // 1. Define the path to the local temp file
  const tempDir = path.resolve(process.cwd(), "temp_uploads");
  const localFilePath = path.join(tempDir, key);

  try {
    // 2. Check if the local file exists
    if (fs.existsSync(localFilePath)) {
      // 3. Delete the file from the local file system
      fs.unlinkSync(localFilePath);
      res.json({ success: true, message: `File ${key} deleted from temp` });
    } else {
      // File doesn't exist, but that's fine, maybe it was already processed
      res.json({
        success: true,
        message: `File ${key} not found in temp, likely already processed.`,
      });
    }
  } catch (err) {
    console.error("Local file deletion failed:", err);
    res.status(500).json({ error: "Failed to delete temp file" });
  }
};

export default removeTemp;