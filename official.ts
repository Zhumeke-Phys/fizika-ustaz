// True only for a server-resolved session belonging to the one-time admin claim.
export function isOfficial(user:{official?:boolean}|null):boolean{return user?.official===true}
