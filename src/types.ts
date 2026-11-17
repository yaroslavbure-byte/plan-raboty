export interface Profile { id: string; name: string; invite_code: string; partner_id: string | null; }
export interface Sub { id: string; title: string; done: boolean; }
export interface LinkItem { id: string; url: string; title?: string; }
export interface FileAtt { id: string; path: string; name: string; size: number; mime: string; local?: boolean; by?: string | null; }
export interface Extra { notes?: string; progress?: number; subtasks?: Sub[]; links?: LinkItem[]; files?: FileAtt[]; [k: string]: any; }
export interface Base { id: string; owner_id: string; position: number; deleted: boolean; created_by?: string | null; updated_by?: string | null; created_at?: string; updated_at?: string; extra?: Extra; }
export interface Task extends Base {
  shared: boolean; assignee_id: string | null; title: string; date: string | null; time: string | null;
  done: boolean; done_at: string | null; done_dates: string[]; repeat: string | null; goal_id: string | null;
}
export interface Goal extends Base { title: string; progress: number; }
export interface Idea extends Base { text: string; }
export interface Notif { id: number; user_id: string; actor_id: string | null; kind: string; title: string; date: string | null; time: string | null; shared: boolean; read: boolean; created_at: string; }
export interface Activity { id: number; plan_owner: string; actor_id: string | null; action: string; title: string; shared: boolean; created_at: string; }
export type Table = 'tasks' | 'goals' | 'ideas';
export type View = 'me' | 'partner' | 'shared';
