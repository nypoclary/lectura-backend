import { r2, DeleteObjectCommand } from "../../lib/r2.js";

const removeTemp = async (req, res) => {
  const { key } = req.params;

  if (!key) {
    return res.status(400).json({ error: "Missing file key" });
  }

  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
      })
    );

    res.json({ success: true, message: `File ${key} deleted from R2` });
  } catch (err) {
    console.error("R2 deletion failed:", err);
    res.status(500).json({ error: "Failed to delete file from R2" });
  }
};

export default removeTemp;
