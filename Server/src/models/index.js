// models/index.js
import sequelize from '../config/sequelize.js';
import User from './User.js';
import QuestionSet from './QuestionSet.js';
import Question from './Question.js';
import Room from './Room.js';
import RoomPlayer from './RoomPlayer.js';


// ensure associations are initialized by importing models (done above)


export {
    sequelize,
    User,
    QuestionSet,
    Question,
    Room,
    RoomPlayer
};
