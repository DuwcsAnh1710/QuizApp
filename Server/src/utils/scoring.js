export function calculateScore(basePoints, timeLimit, timeUsed){
// basePoints: number, timeLimit: seconds, timeUsed: seconds
const remain = Math.max(0, timeLimit - timeUsed);
// bonus tỷ lệ theo thời gian còn lại
const bonusFactor = 1 + (remain / timeLimit) * 0.5; // tối đa +50%
return Math.round(basePoints * bonusFactor);
}

