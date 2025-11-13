import database from "../../database/db.js";

const update = async (req, res) => {
  const userId = req.userId;
  // 1. Get all potential fields from the frontend payload
  const { name, email, vark_type, password } = req.body;

  try {
    const updateFields = [];
    const params = [];

    // 2. Dynamically build the query based on fields provided
    if (name) {
      updateFields.push("name = ?");
      params.push(name);
    }
    // Add email field to update
    if (email) {
      updateFields.push("email = ?");
      params.push(email);
    }
    if (vark_type) {
      updateFields.push("vark_type = ?");
      params.push(vark_type);
    }

    // 4. Check if any fields are actually being updated
    if (updateFields.length === 0) {
      return res
        .status(400)
        .json({ payload: "No information provided to update." });
    }

    // 5. Finalize query and params
    const query = `UPDATE user SET ${updateFields.join(", ")} WHERE id = ?`;
    params.push(userId);

    // 6. Execute the update
    await database.query(query, params);

    // 7. Fetch the updated user data (WITHOUT password)
    // The frontend needs this back to update its state.
    const [rows] = await database.query(
      "SELECT id, name, email, vark_type, created_at FROM user WHERE id = ?",
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ payload: "User not found." });
    }

    // 8. Send the updated user back in the format the frontend expects
    return res.status(200).json({ userDetail: rows[0] });
    
  } catch (error) {
    console.log(error);
    return res.status(500).json({ payload: "Internal Server Error" });
  }
};

export default update;