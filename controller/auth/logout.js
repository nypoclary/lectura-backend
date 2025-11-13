export const logout = (req, res) => {
    try {
      // To log out, we clear the cookie by setting its value to an empty string
      // and setting its expiration date to a time in the past.
      res.cookie("token", "", {
        httpOnly: true, // IMPORTANT: Must match the options used in login
        expires: new Date(0), // Set expiration to the past (1 Jan 1970)
        path: "/", // Ensure it's cleared for the entire site
        // secure: process.env.NODE_ENV === "production", // Add this if you use HTTPS in production
      });
  
      return res
        .status(200)
        .json({ success: true, payload: "Logout successful" });
    } catch (error){
      console.log(error);
      return res
        .status(500)
        .json({ success: false, payload: "Internal server error during logout" });
    }
  };