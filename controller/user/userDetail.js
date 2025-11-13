import database from "../../database/db.js";

const userDetail = async(req, res)=>{
    const userId = req.userId;

    try {
        const [row] = await database.query(
            `SELECT * FROM user WHERE id = ?`,
            [userId]  
        );

        const userDetails = row[0];
        return res.status(200).json({ userDetail : userDetails});

    } catch (error) {
        console.log(error);
        return res.status(500).json({payload: "Internal Server Error"})
    }
}

export default userDetail;