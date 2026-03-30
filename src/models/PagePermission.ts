import mongoose, { Schema, Document, Model } from 'mongoose';
import { UserRole } from '@/types/auth';

export interface IPagePermission extends Document {
  pageRoute: string;
  pageName: string;
  allowedRoles: UserRole[];
  allowedUsers: mongoose.Types.ObjectId[];
}

const PagePermissionSchema = new Schema<IPagePermission>({
  pageRoute: { type: String, required: true, unique: true },
  pageName: { type: String, required: true },
  allowedRoles: [{ type: String, enum: ['super-admin', 'admin', 'employee'] }],
  allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
});

const PagePermission: Model<IPagePermission> =
  mongoose.models.PagePermission ||
  mongoose.model<IPagePermission>('PagePermission', PagePermissionSchema);

export default PagePermission;
