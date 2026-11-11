import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, UserPlus, ShieldCheck, Key, Lock, Edit2, Trash2, 
  Check, CheckSquare, Square, Search, AlertCircle, X, Loader2, 
  Layers, Package, ShoppingCart, Tag, Truck, ChefHat, 
  HandCoins, Wallet, BarChart3, LayoutDashboard, Settings as SettingsIcon,
  RefreshCw, LucideIcon
} from 'lucide-react';
import { User, UserRole, AppTab } from '../types';
import { dbService } from '../db';

interface Props {
  currentUser: User;
  onCurrentUserUpdated?: (updatedUser: User) => void;
}

interface ModuleOption {
  id: AppTab;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

const ALL_MODULES: ModuleOption[] = [
  { id: AppTab.DASHBOARD, label: 'Dashboard', description: 'Métricas, gráficos y resumen general', icon: LayoutDashboard, color: 'text-amber-400' },
  { id: AppTab.INVENTORY, label: 'Inventario', description: 'Productos, existencias y mermas', icon: Package, color: 'text-blue-400' },
  { id: AppTab.SALES, label: 'Ventas POS', description: 'Facturación, punto de venta y tickets', icon: Tag, color: 'text-emerald-400' },
  { id: AppTab.CUSTOMERS, label: 'Clientes', description: 'Directorio y saldos de clientes', icon: Users, color: 'text-teal-400' },
  { id: AppTab.CXC, label: 'Cuentas por Cobrar (CXC)', description: 'Gestión de deudas y abonos de clientes', icon: HandCoins, color: 'text-orange-400' },
  { id: AppTab.PROMOTIONS, label: 'Promociones', description: 'Programas de fidelidad y docenas de 13', icon: Tag, color: 'text-pink-400' },
  { id: AppTab.PURCHASES, label: 'Compras', description: 'Registro de compras e ingresos a stock', icon: ShoppingCart, color: 'text-indigo-400' },
  { id: AppTab.SUPPLIERS, label: 'Proveedores', description: 'Directorio y contactos de proveedores', icon: Truck, color: 'text-cyan-400' },
  { id: AppTab.CXP, label: 'Cuentas por Pagar (CXP)', description: 'Control de pagos a proveedores', icon: Wallet, color: 'text-rose-400' },
  { id: AppTab.EXPENSES, label: 'Gastos', description: 'Gastos operativos de la empresa', icon: Wallet, color: 'text-amber-500' },
  { id: AppTab.MANUFACTURING, label: 'Manufactura', description: 'Recetas, ingredientes y costos de producción', icon: ChefHat, color: 'text-yellow-400' },
  { id: AppTab.REPORTS, label: 'Reportes', description: 'Estadísticas de ventas, ganancias y merma', icon: BarChart3, color: 'text-purple-400' },
  { id: AppTab.SETTINGS, label: 'Ajustes', description: 'Configuración general (Solo Administrador)', icon: SettingsIcon, color: 'text-slate-400' }
];

const DEFAULT_ADMIN_USER: User = {
  id: 'admin-default',
  username: 'admin',
  name: 'Administrador Principal',
  role: 'admin',
  permissions: ALL_MODULES.map(m => m.id)
};

export const UserManagement: React.FC<Props> = ({ currentUser, onCurrentUserUpdated }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal Crear / Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Form State
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('seller');
  const [formPermissions, setFormPermissions] = useState<AppTab[]>([]);

  // Modal Reset Password
  const [resetModalUser, setResetModalUser] = useState<User | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Cargar usuarios desde DB y localStorage
  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      let localList: any[] = [];
      const savedLocal = localStorage.getItem('local_users');
      if (savedLocal) {
        try {
          localList = JSON.parse(savedLocal);
        } catch {
          localList = [];
        }
      }

      // Intentar cargar de la base de datos (SQLite o IndexedDB)
      let dbUsers: User[] = [];
      try {
        dbUsers = await dbService.getAll<User>('users');
      } catch (err) {
        console.warn("No se pudo obtener usuarios de la DB remota:", err);
      }

      // Combinar listas dando prioridad a datos de usuarios completos
      const userMap = new Map<string, User>();

      // Si no hay ningún usuario registrado, asegurar el admin por defecto
      if (localList.length === 0 && dbUsers.length === 0) {
        localList = [{ ...DEFAULT_ADMIN_USER, password: 'admin123' }];
        localStorage.setItem('local_users', JSON.stringify(localList));
      }

      localList.forEach((u: any) => {
        if (u && (u.id || u.username)) {
          const key = (u.username || u.id).toLowerCase();
          userMap.set(key, {
            id: u.id || key,
            username: u.username,
            name: u.name || u.username,
            role: u.role || 'seller',
            permissions: u.permissions || (u.role === 'admin' ? ALL_MODULES.map(m => m.id) : [AppTab.DASHBOARD, AppTab.SALES, AppTab.CUSTOMERS, AppTab.CXC, AppTab.PROMOTIONS]),
            password: u.password
          });
        }
      });

      dbUsers.forEach((u: any) => {
        if (u && (u.id || u.username)) {
          const key = (u.username || u.id).toLowerCase();
          const existing = userMap.get(key);
          userMap.set(key, {
            id: u.id || existing?.id || key,
            username: u.username || existing?.username,
            name: u.name || existing?.name || u.username,
            role: u.role || existing?.role || 'seller',
            permissions: u.permissions && u.permissions.length > 0 
              ? u.permissions 
              : (existing?.permissions || (u.role === 'admin' ? ALL_MODULES.map(m => m.id) : [AppTab.DASHBOARD, AppTab.SALES, AppTab.CUSTOMERS, AppTab.CXC])),
            password: existing?.password
          });
        }
      });

      const finalUsers = Array.from(userMap.values());
      setUsers(finalUsers);
    } catch (err) {
      console.error("Error al cargar lista de usuarios:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Abrir modal de creación
  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setEditingUserId(null);
    setFormName('');
    setFormUsername('');
    setFormPassword('');
    setFormRole('seller');
    // Permisos por defecto para nuevo vendedor
    setFormPermissions([
      AppTab.DASHBOARD,
      AppTab.SALES,
      AppTab.CUSTOMERS,
      AppTab.CXC,
      AppTab.PROMOTIONS
    ]);
    setFormError('');
    setIsModalOpen(true);
  };

  // Abrir modal de edición
  const handleOpenEditModal = (targetUser: User) => {
    setIsEditing(true);
    setEditingUserId(targetUser.id);
    setFormName(targetUser.name);
    setFormUsername(targetUser.username);
    setFormPassword(''); // Opcional al editar
    setFormRole(targetUser.role);
    setFormPermissions(targetUser.permissions && targetUser.permissions.length > 0 
      ? [...targetUser.permissions] 
      : (targetUser.role === 'admin' ? ALL_MODULES.map(m => m.id) : [AppTab.DASHBOARD, AppTab.SALES, AppTab.CUSTOMERS]));
    setFormError('');
    setIsModalOpen(true);
  };

  // Toggle de un permiso individual
  const togglePermission = (tabId: AppTab) => {
    setFormPermissions(prev => {
      if (prev.includes(tabId)) {
        return prev.filter(t => t !== tabId);
      } else {
        return [...prev, tabId];
      }
    });
  };

  // Presets de selección de permisos
  const selectAllPermissions = () => {
    setFormPermissions(ALL_MODULES.map(m => m.id));
  };

  const selectSellerFull = () => {
    setFormPermissions([
      AppTab.DASHBOARD,
      AppTab.INVENTORY,
      AppTab.SALES,
      AppTab.CUSTOMERS,
      AppTab.CXC,
      AppTab.PROMOTIONS
    ]);
  };

  const selectSellerBasic = () => {
    setFormPermissions([
      AppTab.DASHBOARD,
      AppTab.SALES,
      AppTab.CUSTOMERS,
      AppTab.PROMOTIONS
    ]);
  };

  const clearAllPermissions = () => {
    setFormPermissions([]);
  };

  // Cuando cambia el rol a admin en el formulario, marcar todos los módulos
  const handleRoleChange = (role: UserRole) => {
    setFormRole(role);
    if (role === 'admin') {
      selectAllPermissions();
    }
  };

  // Guardar usuario (Crear o Actualizar)
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formName.trim()) {
      setFormError('El nombre completo es obligatorio');
      return;
    }

    if (!formUsername.trim()) {
      setFormError('El nombre de usuario es obligatorio');
      return;
    }

    const cleanUsername = formUsername.trim().toLowerCase();

    if (!isEditing && !formPassword.trim()) {
      setFormError('La contraseña inicial es obligatoria para nuevos usuarios');
      return;
    }

    if (!isEditing && formPassword.trim().length < 4) {
      setFormError('La contraseña debe tener al menos 4 caracteres');
      return;
    }

    // Validar nombre de usuario duplicado al crear
    if (!isEditing) {
      const exists = users.some(u => u.username.toLowerCase() === cleanUsername);
      if (exists) {
        setFormError(`El usuario "${cleanUsername}" ya está registrado`);
        return;
      }
    }

    // Si es vendedor y no tiene ningún permiso seleccionado, advertir
    if (formRole === 'seller' && formPermissions.length === 0) {
      setFormError('Debe otorgar al menos un privilegio o módulo al usuario');
      return;
    }

    setIsSaving(true);
    try {
      const userId = isEditing && editingUserId ? editingUserId : crypto.randomUUID();
      const permsToSave = formRole === 'admin' 
        ? ALL_MODULES.map(m => m.id) 
        : (formPermissions.length > 0 ? formPermissions : [AppTab.DASHBOARD, AppTab.SALES]);

      const userObject: User = {
        id: userId,
        username: cleanUsername,
        name: formName.trim(),
        role: formRole,
        permissions: permsToSave,
        ...(formPassword.trim() ? { password: formPassword.trim() } : {})
      };

      // 1. Guardar localmente en localStorage ('local_users')
      let localUsers: any[] = [];
      const savedLocal = localStorage.getItem('local_users');
      if (savedLocal) {
        try { localUsers = JSON.parse(savedLocal); } catch { localUsers = []; }
      }

      const existingIdx = localUsers.findIndex(
        (u: any) => (u.id && u.id === userId) || (u.username && u.username.toLowerCase() === cleanUsername)
      );

      if (existingIdx >= 0) {
        const existingUser = localUsers[existingIdx];
        localUsers[existingIdx] = {
          ...existingUser,
          ...userObject,
          password: formPassword.trim() ? formPassword.trim() : existingUser.password
        };
      } else {
        localUsers.push(userObject);
      }
      localStorage.setItem('local_users', JSON.stringify(localUsers));

      // 2. Guardar a través de dbService (IndexedDB + SQLite remoto si hay conexión)
      await dbService.put('users', userObject);

      // Si el usuario editado es el mismo que está en sesión, actualizar sesión
      if (currentUser.id === userId || currentUser.username.toLowerCase() === cleanUsername) {
        const updatedCurrent: User = {
          ...currentUser,
          name: formName.trim(),
          role: formRole,
          permissions: permsToSave
        };
        localStorage.setItem('user_data', JSON.stringify(updatedCurrent));
        if (onCurrentUserUpdated) {
          onCurrentUserUpdated(updatedCurrent);
        }
      }

      setIsModalOpen(false);
      await loadUsers();
    } catch (err: any) {
      console.error("Error al guardar usuario:", err);
      setFormError(err.message || 'Error al guardar el usuario en el sistema');
    } finally {
      setIsSaving(false);
    }
  };

  // Eliminar usuario
  const handleDeleteUser = async (targetUser: User) => {
    // 1. No permitir que se elimine a sí mismo
    if (targetUser.id === currentUser.id || targetUser.username.toLowerCase() === currentUser.username.toLowerCase()) {
      alert("⚠️ No puedes eliminar tu propia cuenta mientras estás conectado.");
      return;
    }

    // 2. No permitir eliminar si es el único administrador
    if (targetUser.role === 'admin') {
      const adminCount = users.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        alert("⚠️ No se puede eliminar este usuario porque es el único administrador del sistema.");
        return;
      }
    }

    const confirmDelete = confirm(
      `¿Está seguro de que desea eliminar al usuario "${targetUser.name}" (@${targetUser.username})?\n\nEsta acción revocará su acceso permanentemente.`
    );

    if (!confirmDelete) return;

    try {
      // 1. Eliminar de localStorage
      let localUsers: any[] = [];
      const savedLocal = localStorage.getItem('local_users');
      if (savedLocal) {
        try { localUsers = JSON.parse(savedLocal); } catch { localUsers = []; }
      }
      const filtered = localUsers.filter(
        (u: any) => u.id !== targetUser.id && u.username?.toLowerCase() !== targetUser.username.toLowerCase()
      );
      localStorage.setItem('local_users', JSON.stringify(filtered));

      // 2. Eliminar a través de dbService
      await dbService.delete('users', targetUser.id);

      await loadUsers();
      alert(`✅ Usuario "${targetUser.name}" eliminado correctamente.`);
    } catch (err: any) {
      console.error("Error al eliminar usuario:", err);
      alert("Error al eliminar usuario: " + (err.message || 'Intente nuevamente'));
    }
  };

  // Restablecer contraseña directamente
  const handleOpenResetModal = (targetUser: User) => {
    setResetModalUser(targetUser);
    setResetNewPassword('');
    setResetConfirmPassword('');
    setResetError('');
    setIsResetting(false);
  };

  const handleSaveResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser) return;
    setResetError('');

    if (!resetNewPassword.trim()) {
      setResetError('Debe ingresar una nueva contraseña');
      return;
    }

    if (resetNewPassword.trim().length < 4) {
      setResetError('La contraseña debe tener al menos 4 caracteres');
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('Las contraseñas no coinciden');
      return;
    }

    setIsResetting(true);
    try {
      const newPass = resetNewPassword.trim();

      // 1. Actualizar en localStorage
      let localUsers: any[] = [];
      const savedLocal = localStorage.getItem('local_users');
      if (savedLocal) {
        try { localUsers = JSON.parse(savedLocal); } catch { localUsers = []; }
      }

      const idx = localUsers.findIndex(
        (u: any) => u.id === resetModalUser.id || u.username?.toLowerCase() === resetModalUser.username.toLowerCase()
      );

      if (idx >= 0) {
        localUsers[idx].password = newPass;
      } else {
        localUsers.push({ ...resetModalUser, password: newPass });
      }
      localStorage.setItem('local_users', JSON.stringify(localUsers));

      // 2. Actualizar vía dbService / servidor
      await dbService.put('users', {
        ...resetModalUser,
        password: newPass
      });

      // Si el usuario es el actual en sesión
      if (resetModalUser.username.toLowerCase() === currentUser.username.toLowerCase()) {
        try {
          const uStr = localStorage.getItem('user_data');
          if (uStr) {
            const parsed = JSON.parse(uStr);
            localStorage.setItem('user_data', JSON.stringify({ ...parsed, password: newPass }));
          }
        } catch {}
      }

      alert(`✅ Contraseña restablecida con éxito para "${resetModalUser.name}" (@${resetModalUser.username}).`);
      setResetModalUser(null);
      await loadUsers();
    } catch (err: any) {
      console.error("Error al restablecer contraseña:", err);
      setResetError(err.message || 'Error al restablecer contraseña');
    } finally {
      setIsResetting(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.role === 'admin' ? 'administrador' : 'vendedor').includes(searchTerm.toLowerCase())
  );

  return (
    <section id="user-management-section" className="bg-[#1e293b] p-6 md:p-8 rounded-[2.5rem] border border-slate-700 shadow-xl space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-700/60">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-orange-500/10 text-orange-500 rounded-xl">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                Gestión de Usuarios y Privilegios
              </h2>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                Control exclusivo de administrador • Agrega, edita privilegios o restablece contraseñas
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadUsers}
            title="Refrescar lista"
            className="p-3 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition-all active:scale-95"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-black py-3 px-4 rounded-xl transition-all shadow-lg shadow-orange-500/20 text-[10px] uppercase tracking-widest flex items-center gap-2"
          >
            <UserPlus size={16} />
            <span>Nuevo Usuario</span>
          </button>
        </div>
      </div>

      {/* Buscador y Resumen */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar usuario o rol..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#0f172a] border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white font-bold outline-none focus:border-orange-500/50"
          />
        </div>

        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-400 w-full sm:w-auto justify-end">
          <span className="px-2.5 py-1 bg-slate-900 rounded-lg border border-slate-700">
            Total: <strong className="text-white">{users.length}</strong>
          </span>
          <span className="px-2.5 py-1 bg-orange-500/10 text-orange-400 rounded-lg border border-orange-500/20">
            Admins: <strong>{users.filter(u => u.role === 'admin').length}</strong>
          </span>
          <span className="px-2.5 py-1 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
            Vendedores: <strong>{users.filter(u => u.role === 'seller').length}</strong>
          </span>
        </div>
      </div>

      {/* Lista de Usuarios */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 size={24} className="animate-spin text-orange-500" />
          <span className="text-[10px] font-black uppercase tracking-widest">Cargando usuarios...</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="py-12 text-center bg-slate-900/40 rounded-2xl border border-dashed border-slate-700/80 p-6">
          <Users size={32} className="mx-auto text-slate-600 mb-2" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">No se encontraron usuarios</p>
          <p className="text-[10px] text-slate-500 uppercase mt-1">Crea un nuevo usuario con el botón superior</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredUsers.map((u) => {
            const isMe = u.id === currentUser.id || u.username.toLowerCase() === currentUser.username.toLowerCase();
            const isAdmin = u.role === 'admin';
            const userPerms = u.permissions || (isAdmin ? ALL_MODULES.map(m => m.id) : []);

            return (
              <div 
                key={u.id || u.username}
                className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  isMe 
                    ? 'bg-slate-900/90 border-orange-500/40 shadow-md shadow-orange-500/5' 
                    : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Info Usuario */}
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-sm uppercase shrink-0 shadow-lg ${
                      isAdmin ? 'bg-gradient-to-br from-orange-500 to-amber-600 shadow-orange-500/20' : 'bg-gradient-to-br from-blue-600 to-indigo-700 shadow-blue-500/20'
                    }`}>
                      {u.name ? u.name.slice(0, 2).toUpperCase() : u.username.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-tight truncate">
                          {u.name}
                        </h3>
                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${
                          isAdmin 
                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' 
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}>
                          {isAdmin ? 'ADMINISTRADOR' : 'VENDEDOR'}
                        </span>
                        {isMe && (
                          <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            TU SESIÓN ACTIVA
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
                        <span>Usuario: <strong className="text-slate-200">@{u.username}</strong></span>
                        <span>•</span>
                        <span>Privilegios: <strong className="text-slate-200">{isAdmin ? 'Acceso Total (13)' : `${userPerms.length} módulos`}</strong></span>
                      </p>
                    </div>
                  </div>

                  {/* Botones de Acción */}
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
                    {/* Botón Restablecer Contraseña */}
                    <button
                      type="button"
                      onClick={() => handleOpenResetModal(u)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-wider border border-slate-700 flex items-center gap-1.5 transition-all active:scale-95"
                      title="Restablecer o cambiar la contraseña de este usuario"
                    >
                      <Key size={13} className="text-amber-400" />
                      <span>Contraseña</span>
                    </button>

                    {/* Botón Editar Privilegios */}
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(u)}
                      className="px-3 py-2 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-wider border border-blue-600/30 flex items-center gap-1.5 transition-all active:scale-95"
                      title="Editar nombre, rol y privilegios"
                    >
                      <Edit2 size={13} />
                      <span>Privilegios</span>
                    </button>

                    {/* Botón Eliminar */}
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u)}
                      disabled={isMe}
                      className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all ${
                        isMe 
                          ? 'opacity-30 cursor-not-allowed bg-slate-800 text-slate-500 border-slate-700' 
                          : 'bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border-rose-500/30 active:scale-95'
                      }`}
                      title={isMe ? "No puedes eliminar tu propio usuario en uso" : "Eliminar usuario permanentemente"}
                    >
                      <Trash2 size={13} />
                      <span>Eliminar</span>
                    </button>
                  </div>
                </div>

                {/* Vista de Módulos Otorgados */}
                <div className="mt-3.5 pt-3 border-t border-slate-800/80">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                    <Layers size={11} /> Módulos con Acceso Concedido:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_MODULES.map((m) => {
                      const hasAccess = isAdmin || userPerms.includes(m.id);
                      if (!hasAccess) return null;
                      return (
                        <span
                          key={m.id}
                          className="px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-wider bg-slate-800/80 border border-slate-700/60 text-slate-300 flex items-center gap-1"
                        >
                          <m.icon size={10} className={m.color} />
                          {m.label}
                        </span>
                      );
                    })}
                    {!isAdmin && userPerms.length === 0 && (
                      <span className="text-[8px] font-bold text-rose-400 uppercase italic">
                        Sin privilegios asignados (usuario sin acceso a pantallas)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Crear o Editar Usuario y Privilegios */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#1e293b] border border-slate-700 rounded-[2.5rem] w-full max-w-2xl p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 my-8 max-h-[90vh] flex flex-col">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-orange-500/10 text-orange-500 rounded-xl">
                  {isEditing ? <Edit2 size={18} /> : <UserPlus size={18} />}
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    {isEditing ? `Editar Privilegios de @${formUsername}` : 'Crear Nuevo Usuario'}
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    Asigna credenciales y módulos permitidos en el sistema
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSaveUser} className="flex-1 overflow-y-auto py-4 space-y-5 pr-1">
              {formError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-bold flex items-center gap-2 uppercase tracking-wide">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Datos Básicos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. María Gómez"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500/50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Nombre de Usuario (Login) *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isEditing}
                    placeholder="Ej. maria_ventas"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {isEditing && (
                    <span className="text-[8px] text-slate-500 font-bold uppercase ml-1">
                      El nombre de usuario no se puede cambiar después de creado
                    </span>
                  )}
                </div>
              </div>

              {/* Rol y Contraseña */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Rol en el Sistema *
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500/50"
                  >
                    <option value="seller">Vendedor (Acceso personalizado)</option>
                    <option value="admin">Administrador (Acceso total)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    {isEditing ? 'Nueva Contraseña (Opcional)' : 'Contraseña Inicial *'}
                  </label>
                  <input
                    type="password"
                    placeholder={isEditing ? 'Dejar en blanco para conservar actual' : 'Mínimo 4 caracteres'}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500/50"
                  />
                </div>
              </div>

              {/* Privilegios / Selección de Módulos */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-orange-500" />
                      Privilegios de Pantallas y Módulos
                    </label>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">
                      {formRole === 'admin' 
                        ? 'Los administradores tienen acceso irrestricto a todos los módulos' 
                        : 'Seleccione individualmente a qué secciones puede acceder este usuario'}
                    </p>
                  </div>

                  {formRole === 'seller' && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={selectAllPermissions}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[8px] font-black uppercase tracking-wider border border-slate-700 active:scale-95"
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={selectSellerFull}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg text-[8px] font-black uppercase tracking-wider border border-slate-700 active:scale-95"
                      >
                        Ventas+Stock
                      </button>
                      <button
                        type="button"
                        onClick={selectSellerBasic}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-lg text-[8px] font-black uppercase tracking-wider border border-slate-700 active:scale-95"
                      >
                        Básico
                      </button>
                      <button
                        type="button"
                        onClick={clearAllPermissions}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-lg text-[8px] font-black uppercase tracking-wider border border-slate-700 active:scale-95"
                      >
                        Ninguno
                      </button>
                    </div>
                  )}
                </div>

                {/* Grid de Privilegios */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {ALL_MODULES.map((m) => {
                    const isSettingsTab = m.id === AppTab.SETTINGS;
                    const isChecked = formRole === 'admin' ? true : formPermissions.includes(m.id);
                    // Los ajustes solo deben ser para admins
                    const isDisabled = formRole === 'admin' || isSettingsTab;

                    return (
                      <button
                        type="button"
                        key={m.id}
                        disabled={isDisabled}
                        onClick={() => togglePermission(m.id)}
                        className={`p-3 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 ${
                          isChecked 
                            ? 'bg-slate-900 border-orange-500/50 text-white' 
                            : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                        } ${isDisabled ? 'opacity-80 cursor-default' : 'active:scale-98 cursor-pointer'}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-xl bg-slate-800 shrink-0 ${isChecked ? m.color : 'text-slate-500'}`}>
                            <m.icon size={16} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-tight truncate text-white">
                              {m.label}
                            </p>
                            <p className="text-[8px] font-bold text-slate-500 line-clamp-1">
                              {isSettingsTab && formRole !== 'admin' ? 'Exclusivo para Administrador' : m.description}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {isChecked ? (
                            <div className="w-5 h-5 rounded-lg bg-orange-500 text-white flex items-center justify-center">
                              <Check size={13} strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-lg border border-slate-700 bg-slate-950/50" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Botones de acción del Modal */}
              <div className="pt-4 border-t border-slate-700 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-3 rounded-xl text-slate-400 hover:text-white font-black text-[10px] uppercase tracking-widest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-black py-3 px-6 rounded-xl transition-all shadow-lg shadow-orange-500/20 text-[10px] uppercase tracking-widest flex items-center gap-2"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  <span>{isEditing ? 'Guardar Cambios' : 'Crear Usuario'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Restablecer Contraseña (Solución a Contraseña Olvidada) */}
      {resetModalUser && (
        <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e293b] border border-slate-700 rounded-[2.5rem] w-full max-w-md p-6 sm:p-8 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                  <Key size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Restablecer Contraseña
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    Para: @{resetModalUser.username} ({resetModalUser.name})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetModalUser(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveResetPassword} className="py-4 space-y-4">
              <p className="text-[10px] font-bold text-slate-300 uppercase leading-relaxed tracking-tight bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                ℹ️ Como administrador, puedes asignar una nueva contraseña directamente sin requerir la anterior.
              </p>

              {resetError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-bold flex items-center gap-2 uppercase tracking-wide">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Nueva Contraseña *
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 4 caracteres"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-white outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Confirmar Nueva Contraseña *
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    required
                    placeholder="Repite la nueva contraseña"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-white outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-700 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white font-black text-[10px] uppercase tracking-widest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black py-3 px-5 rounded-xl transition-all shadow-lg shadow-amber-500/20 text-[10px] uppercase tracking-widest flex items-center gap-2"
                >
                  {isResetting ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
                  <span>Guardar Contraseña</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default UserManagement;
