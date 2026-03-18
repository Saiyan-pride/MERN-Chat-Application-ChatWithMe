const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const userRoute = require("./routes/userRoute");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const app = express();
dotenv.config();
connectDB();
const PORT = process.env.PORT || 5000;
app.use(express.json()); // to accept json data
app.get("/", (req, res) => {
  res.send("API is running");
});

app.use("/api/user", userRoute);
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`server is running on http://localhost:${PORT}`);
});
