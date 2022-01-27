/*****************************************************************************
__/\\\\\\\\\\\\\\\__/\\\\\\\\\\\_____/\\\\\\\\\\\\__/\\\\\\\\\\\\\\\_        
 _\////////////\\\__\/////\\\///____/\\\//////////__\/\\\///////////__       
  ___________/\\\/_______\/\\\______/\\\_____________\/\\\_____________      
   _________/\\\/_________\/\\\_____\/\\\____/\\\\\\\_\/\\\\\\\\\\\_____     
    _______/\\\/___________\/\\\_____\/\\\___\/////\\\_\/\\\///////______    
     _____/\\\/_____________\/\\\_____\/\\\_______\/\\\_\/\\\_____________   
      ___/\\\/_______________\/\\\_____\/\\\_______\/\\\_\/\\\_____________  
       __/\\\\\\\\\\\\\\\__/\\\\\\\\\\\_\//\\\\\\\\\\\\/__\/\\\\\\\\\\\\\\\_ 
        _\///////////////__\///////////___\////////////____\///////////////__
*****************************************************************************/

const mongoose = require("mongoose");

module.exports = {
  init: () => {
    const dbOptions = {
      useNewUrlParser: true,
      //useUnifiedTopology: true,
      autoIndex: true,
      //poolSize: 5,
      connectTimeoutMS: 10000,
      family: 4,
    };

    mongoose.connect(process.env.MONGOOSE_KEY, dbOptions);

    //mongoose.set("useFindAndModify", false);
    mongoose.Promise = global.Promise;

    mongoose.connection.on("connected", () => {
      console.log(" ");
      console.log("MongoDB - Připojeno.");
    });

    mongoose.connection.on("err", (err) => {
      console.log(" ");
      console.error(`MongoDB - Chyba: \n${err.stack}`);
    });

    mongoose.connection.on("dissconnected", () => {
      console.log(" ");
      console.warn("MongoDB - Připojení přerušeno.");
    });
  },
};
