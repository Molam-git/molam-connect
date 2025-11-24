import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Interface pour les attributs requis
interface MolamQRCodeAttributes {
    id: string;
    user_id: string;
    transaction_id?: string;
    qr_value: string;
    amount?: number;
    currency: string;
    expires_at: Date;
    status: string;
    created_at?: Date;
    used_at?: Date;
}

// Interface pour les attributs optionnels (pour la création)
interface MolamQRCodeCreationAttributes extends Optional<MolamQRCodeAttributes, 'id' | 'created_at' | 'used_at' | 'transaction_id' | 'amount'> { }

class MolamQRCode extends Model<MolamQRCodeAttributes, MolamQRCodeCreationAttributes> implements MolamQRCodeAttributes {
    public id!: string;
    public user_id!: string;
    public transaction_id!: string;
    public qr_value!: string;
    public amount!: number;
    public currency!: string;
    public expires_at!: Date;
    public status!: string;
    public created_at!: Date;
    public used_at!: Date;

    // Méthodes éventuelles
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

MolamQRCode.init(
    {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        transaction_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        qr_value: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        amount: {
            type: DataTypes.DECIMAL(18, 2),
            allowNull: true,
        },
        currency: {
            type: DataTypes.STRING,
            defaultValue: 'XOF',
            allowNull: false,
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING,
            defaultValue: 'active',
            allowNull: false,
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
        used_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: 'molam_qr_codes',
        timestamps: false, // On gère manuellement les timestamps
    }
);

export default MolamQRCode;