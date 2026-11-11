import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Search, Trash2, Save, X, ChefHat, Scale, Droplets, Box, 
  Calculator, Copy, Printer, Trash, ChevronRight, Info, Edit2
} from 'lucide-react';
import { Ingredient, Recipe, RecipeIngredient, AppSettings } from '../types';
import { dbService } from '../db';

interface ManufacturingProps {
  settings: AppSettings;
}

const Manufacturing: React.FC<ManufacturingProps> = ({ settings }) => {
  const [activeTab, setActiveTab] = useState<'ingredients' | 'recipes'>('ingredients');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showIngredientModal, setShowIngredientModal] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ show: boolean; title: string; onConfirm: () => void } | null>(null);

  // Manejar retroceso de modales con la flecha atrás de Android
  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (confirmModal) {
        e.preventDefault();
        setConfirmModal(null);
        return;
      }
      if (showIngredientModal) {
        e.preventDefault();
        setShowIngredientModal(false);
        return;
      }
      if (showRecipeModal) {
        e.preventDefault();
        setShowRecipeModal(false);
        return;
      }
    };
    window.addEventListener('app:backbutton', handleBackButton);
    return () => window.removeEventListener('app:backbutton', handleBackButton);
  }, [confirmModal, showIngredientModal, showRecipeModal]);

  // New Ingredient State
  const [newIngredient, setNewIngredient] = useState<Partial<Ingredient>>({
    name: '',
    quantity: 0,
    unit: 'gramos',
    priceUSD: 0
  });

  // New Recipe State
  const [newRecipe, setNewRecipe] = useState<Partial<Recipe>>({
    name: '',
    ingredients: [],
    profitPercentage: 0,
    portions: 1,
    pricePerPortionUSD: 0,
    totalCostUSD: 0,
    totalProfitUSD: 0,
    totalSaleUSD: 0,
    costPerPortionUSD: 0,
    profitPerPortionUSD: 0
  });

  const [recipeTab, setRecipeTab] = useState<'ingredients' | 'preparation'>('ingredients');

  const loadData = useCallback(async () => {
    try {
      console.log("Cargando datos de manufactura...");
      await dbService.init();
      const [ing, rec] = await Promise.all([
        dbService.getAll<Ingredient>('ingredients'),
        dbService.getAll<Recipe>('recipes')
      ]);
      console.log("Ingredientes cargados:", ing?.length || 0);
      console.log("Recetas cargadas:", rec?.length || 0);
      setIngredients(ing || []);
      setRecipes(rec || []);
    } catch (err) {
      console.error("Error loading manufacturing data:", err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveIngredient = async () => {
    if (!newIngredient.name?.trim()) {
      alert('EL NOMBRE ES REQUERIDO');
      return;
    }
    if (newIngredient.quantity === undefined || newIngredient.quantity === null) {
      alert('LA CANTIDAD ES REQUERIDA');
      return;
    }
    if (newIngredient.priceUSD === undefined || newIngredient.priceUSD === null) {
      alert('EL PRECIO ES REQUERIDO');
      return;
    }

    try {
      console.log("Guardando ingrediente:", newIngredient);
      const ingredient: Ingredient = {
        id: (newIngredient as Ingredient).id || crypto.randomUUID(),
        name: newIngredient.name.trim(),
        quantity: Number(newIngredient.quantity),
        unit: newIngredient.unit as any,
        priceUSD: Number(newIngredient.priceUSD)
      };
      await dbService.put('ingredients', ingredient);
      console.log("Ingrediente guardado con éxito");
      setShowIngredientModal(false);
      setNewIngredient({ name: '', quantity: 0, unit: 'gramos', priceUSD: 0 });
      await loadData();
    } catch (err) {
      console.error("Error saving ingredient:", err);
      alert('ERROR AL GUARDAR EL INGREDIENTE');
    }
  };

  const handleDeleteIngredient = async (id: string) => {
    setConfirmModal({
      show: true,
      title: '¿ELIMINAR ESTE INGREDIENTE?',
      onConfirm: async () => {
        await dbService.delete('ingredients', id);
        loadData();
        setConfirmModal(null);
      }
    });
  };

  // Recipe Logic
  const calculateRecipe = () => {
    const totalCost = newRecipe.ingredients?.reduce((sum, ing) => sum + (ing.costUSD || 0), 0) || 0;
    const portions = newRecipe.portions || 1;
    const profitPercent = newRecipe.profitPercentage || 0;
    
    const totalSale = totalCost * (1 + profitPercent / 100);
    const totalProfit = totalSale - totalCost;
    
    const costPerPortion = totalCost / portions;
    const profitPerPortion = totalProfit / portions;
    const pricePerPortion = totalSale / portions;

    setNewRecipe(prev => ({
      ...prev,
      totalCostUSD: totalCost,
      totalSaleUSD: totalSale,
      totalProfitUSD: totalProfit,
      costPerPortionUSD: costPerPortion,
      profitPerPortionUSD: profitPerPortion,
      pricePerPortionUSD: pricePerPortion
    }));
  };

  const handlePVPChange = (pvp: number) => {
    const totalCost = newRecipe.ingredients?.reduce((sum, ing) => sum + (ing.costUSD || 0), 0) || 0;
    const portions = newRecipe.portions || 1;
    
    if (totalCost > 0) {
      const totalSale = pvp * portions;
      const profitPercent = ((totalSale / totalCost) - 1) * 100;
      
      setNewRecipe(prev => ({
        ...prev,
        pricePerPortionUSD: pvp,
        profitPercentage: Number(profitPercent.toFixed(2))
      }));
    } else {
      setNewRecipe(prev => ({ ...prev, pricePerPortionUSD: pvp }));
    }
  };

  const handleAddIngredientToRecipe = (ing: Ingredient) => {
    const recipeIng: RecipeIngredient = {
      ingredientId: ing.id,
      name: ing.name,
      quantity: 0,
      unit: ing.unit,
      costUSD: 0
    };
    setNewRecipe(prev => ({
      ...prev,
      ingredients: [...(prev.ingredients || []), recipeIng]
    }));
  };

  const updateRecipeIngredient = (index: number, quantity: number) => {
    const updatedIngredients = [...(newRecipe.ingredients || [])];
    const ing = updatedIngredients[index];
    const sourceIng = ingredients.find(i => i.id === ing.ingredientId);
    
    if (sourceIng) {
      ing.quantity = quantity;
      ing.costUSD = (sourceIng.priceUSD / sourceIng.quantity) * quantity;
    }
    
    setNewRecipe(prev => ({ ...prev, ingredients: updatedIngredients }));
  };

  const handleSaveRecipe = async () => {
    if (!newRecipe.name?.trim()) {
      alert('EL NOMBRE DE LA RECETA ES REQUERIDO');
      return;
    }
    if (!newRecipe.ingredients?.length) {
      alert('LA RECETA DEBE TENER AL MENOS UN INGREDIENTE');
      return;
    }

    try {
      console.log("Guardando receta:", newRecipe);
      const recipe: Recipe = {
        ...(newRecipe as Recipe),
        id: (newRecipe as Recipe).id || crypto.randomUUID(),
        name: newRecipe.name.trim()
      };
      await dbService.put('recipes', recipe);
      console.log("Receta guardada con éxito");
      setShowRecipeModal(false);
      setNewRecipe({
        name: '',
        ingredients: [],
        profitPercentage: 0,
        portions: 1,
        pricePerPortionUSD: 0,
        totalCostUSD: 0,
        totalProfitUSD: 0,
        totalSaleUSD: 0,
        costPerPortionUSD: 0,
        profitPerPortionUSD: 0
      });
      await loadData();
    } catch (err) {
      console.error("Error saving recipe:", err);
      alert('ERROR AL GUARDAR LA RECETA');
    }
  };

  const handleDeleteRecipe = async (id: string) => {
    setConfirmModal({
      show: true,
      title: '¿ELIMINAR ESTA RECETA?',
      onConfirm: async () => {
        await dbService.delete('recipes', id);
        loadData();
        setConfirmModal(null);
      }
    });
  };

  const filteredIngredients = ingredients.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredRecipes = recipes.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-orange-500/10 text-orange-500 rounded-2xl flex items-center justify-center">
            <ChefHat size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter">Manufactura</h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gestión de Ingredientes y Recetas</p>
          </div>
        </div>

        <div className="flex bg-[#1e293b] p-1 rounded-2xl border border-slate-700">
          <button 
            onClick={() => setActiveTab('ingredients')}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'ingredients' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            Ingredientes
          </button>
          <button 
            onClick={() => setActiveTab('recipes')}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'recipes' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            Recetas
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input 
          type="text" 
          placeholder={`BUSCAR ${activeTab === 'ingredients' ? 'INGREDIENTE' : 'RECETA'}...`}
          className="w-full bg-[#1e293b] border border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-xs font-bold text-white outline-none focus:border-orange-500 transition-all uppercase tracking-widest"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Content */}
      {activeTab === 'ingredients' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIngredients.length === 0 ? (
            <div className="col-span-full py-20 text-center space-y-3 opacity-30">
              <Box size={48} className="mx-auto text-slate-500" />
              <p className="text-xs font-black uppercase tracking-widest">No hay ingredientes registrados</p>
            </div>
          ) : filteredIngredients.map(ing => (
            <div key={ing.id} className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700 hover:border-orange-500 transition-all group">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-400">
                    {ing.unit === 'gramos' || ing.unit === 'kilogramos' ? <Scale size={18} /> : ing.unit === 'mililitros' || ing.unit === 'litros' ? <Droplets size={18} /> : <Box size={18} />}
                  </div>
                  <div>
                    <p className="font-black text-xs text-white uppercase truncate">{ing.name}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">{ing.quantity} {ing.unit}</p>
                  </div>
                </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => {
                        setNewIngredient(ing);
                        setShowIngredientModal(true);
                      }}
                      className="p-2 text-slate-500 hover:text-orange-500 transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDeleteIngredient(ing.id)} className="p-2 text-slate-500 hover:text-rose-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-slate-700/50">
                <p className="text-[10px] font-black text-slate-500 uppercase">Precio Compra</p>
                <p className="text-sm font-black text-emerald-400">${ing.priceUSD.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRecipes.length === 0 ? (
            <div className="col-span-full py-20 text-center space-y-3 opacity-30">
              <ChefHat size={48} className="mx-auto text-slate-500" />
              <p className="text-xs font-black uppercase tracking-widest">No hay recetas registradas</p>
            </div>
          ) : filteredRecipes.map(recipe => (
            <div key={recipe.id} className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700 hover:border-orange-500 transition-all group cursor-pointer" onClick={() => { setNewRecipe(recipe); setShowRecipeModal(true); }}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500/10 text-orange-500 rounded-xl flex items-center justify-center">
                    <ChefHat size={18} />
                  </div>
                  <div>
                    <p className="font-black text-xs text-white uppercase truncate">{recipe.name}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">{recipe.ingredients.length} Ingredientes</p>
                  </div>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(recipe.id); }} 
                  className="p-2 text-slate-500 hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-700/50">
                <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase">Costo Total</p>
                  <p className="text-xs font-black text-white">${recipe.totalCostUSD.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black text-slate-500 uppercase">PVP</p>
                  <p className="text-xs font-black text-emerald-400">${recipe.pricePerPortionUSD.toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FABs */}
      <button 
        onClick={() => {
          if (activeTab === 'ingredients') {
            setNewIngredient({ name: '', quantity: 0, unit: 'gramos', priceUSD: 0 });
            setShowIngredientModal(true);
          } else {
            setNewRecipe({
              name: '',
              ingredients: [],
              profitPercentage: 0,
              portions: 1,
              pricePerPortionUSD: 0,
              totalCostUSD: 0,
              totalProfitUSD: 0,
              totalSaleUSD: 0,
              costPerPortionUSD: 0,
              profitPerPortionUSD: 0
            });
            setShowRecipeModal(true);
          }
        }}
        className="fixed bottom-24 md:bottom-8 right-8 w-14 h-14 bg-orange-500 text-white rounded-full shadow-2xl shadow-orange-500/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-40"
      >
        <Plus size={32} />
      </button>

      {/* Ingredient Modal */}
      {showIngredientModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] w-full max-w-md rounded-[2.5rem] border border-slate-700 shadow-2xl animate-in zoom-in-95 overflow-hidden">
            <div className="p-8 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">
                {newIngredient.id ? 'Editar Ingrediente' : 'Nuevo Ingrediente'}
              </h3>
              <button onClick={() => setShowIngredientModal(false)} className="text-slate-500 hover:text-white"><X size={24} /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre</label>
                <input 
                  type="text" 
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-orange-500 transition-all"
                  value={newIngredient.name}
                  onChange={(e) => setNewIngredient({...newIngredient, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cantidad</label>
                  <input 
                    type="number" 
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-orange-500 transition-all"
                    value={newIngredient.quantity}
                    onChange={(e) => setNewIngredient({...newIngredient, quantity: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Unidad</label>
                  <select 
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-orange-500 transition-all uppercase"
                    value={newIngredient.unit}
                    onChange={(e) => setNewIngredient({...newIngredient, unit: e.target.value as any})}
                  >
                    <option value="gramos">Gramos</option>
                    <option value="kilogramos">Kilogramos</option>
                    <option value="mililitros">Mililitros</option>
                    <option value="litros">Litros</option>
                    <option value="piezas">Piezas</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Precio Compra ($)</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-orange-500 transition-all"
                  value={newIngredient.priceUSD}
                  onChange={(e) => setNewIngredient({...newIngredient, priceUSD: Number(e.target.value)})}
                />
              </div>
              <button 
                onClick={handleSaveIngredient}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-orange-500/20 uppercase text-xs tracking-widest"
              >
                Guardar Ingrediente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recipe Modal */}
      {showRecipeModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] w-full max-w-2xl h-[90vh] rounded-[2.5rem] border border-slate-700 shadow-2xl animate-in zoom-in-95 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-700 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <input 
                  type="text" 
                  placeholder="Nombre Receta, Plato..."
                  className="bg-transparent text-2xl font-black uppercase tracking-tighter outline-none border-b-2 border-orange-500/30 focus:border-orange-500 w-full mr-4"
                  value={newRecipe.name}
                  onChange={(e) => setNewRecipe({...newRecipe, name: e.target.value})}
                />
                <button onClick={() => setShowRecipeModal(false)} className="text-slate-500 hover:text-white"><X size={24} /></button>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setRecipeTab('ingredients')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${recipeTab === 'ingredients' ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400'}`}
                >
                  Ingredientes
                </button>
                <button 
                  className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-800 text-slate-400 opacity-50 cursor-not-allowed"
                >
                  Imprimir
                </button>
                <button 
                  onClick={() => setRecipeTab('preparation')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${recipeTab === 'preparation' ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400'}`}
                >
                  Preparación
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {recipeTab === 'ingredients' ? (
                <div className="space-y-4">
                  {/* Selected Ingredients */}
                  <div className="space-y-2">
                    {newRecipe.ingredients?.length === 0 ? (
                      <div className="py-10 text-center border-2 border-dashed border-slate-700 rounded-2xl opacity-30">
                        <Info size={24} className="mx-auto mb-2" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Añade ingredientes abajo</p>
                      </div>
                    ) : newRecipe.ingredients?.map((ing, idx) => {
                      const sourceIng = ingredients.find(i => i.id === ing.ingredientId);
                      return (
                        <div key={idx} className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-xs font-black text-emerald-400 uppercase">{ing.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[8px] font-black text-slate-500 uppercase">Cantidad:</span>
                              <input 
                                type="number" 
                                className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[10px] font-bold text-white outline-none"
                                value={ing.quantity}
                                onChange={(e) => updateRecipeIngredient(idx, Number(e.target.value))}
                              />
                              <span className="text-[10px] font-bold text-slate-400 uppercase">{ing.unit}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] font-black text-slate-500 uppercase">Precio Compra: {sourceIng?.priceUSD.toFixed(2)}</p>
                            <p className="text-xs font-black text-white">Costo: ${ing.costUSD.toFixed(2)}</p>
                          </div>
                          <button 
                            onClick={() => setNewRecipe(prev => ({ ...prev, ingredients: prev.ingredients?.filter((_, i) => i !== idx) }))}
                            className="text-slate-500 hover:text-rose-500"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Ingredient to Recipe */}
                  <div className="pt-4 border-t border-slate-700">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Añadir Ingredientes</p>
                    <div className="grid grid-cols-2 gap-2">
                      {ingredients.filter(i => !newRecipe.ingredients?.find(ri => ri.ingredientId === i.id)).map(ing => (
                        <button 
                          key={ing.id}
                          onClick={() => handleAddIngredientToRecipe(ing)}
                          className="p-3 bg-slate-800/30 border border-slate-700 rounded-xl text-left hover:border-orange-500 transition-all flex items-center justify-between group"
                        >
                          <div>
                            <p className="text-[10px] font-black text-white uppercase truncate">{ing.name}</p>
                            <p className="text-[8px] font-bold text-slate-500 uppercase">${ing.priceUSD.toFixed(2)} / {ing.quantity}{ing.unit}</p>
                          </div>
                          <Plus size={14} className="text-slate-500 group-hover:text-orange-500" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <textarea 
                  className="w-full h-full bg-slate-800/30 border border-slate-700 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-orange-500 transition-all resize-none"
                  placeholder="Instrucciones de preparación..."
                  value={newRecipe.preparation}
                  onChange={(e) => setNewRecipe({...newRecipe, preparation: e.target.value})}
                />
              )}
            </div>

            {/* Footer Summary */}
            <div className="p-4 bg-slate-900/50 border-t border-slate-700">
              {/* Top Row: Editable Fields */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-500 uppercase ml-1">% Gana</label>
                  <input 
                    type="number" 
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-black text-white outline-none"
                    value={newRecipe.profitPercentage}
                    onChange={(e) => setNewRecipe({...newRecipe, profitPercentage: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-500 uppercase ml-1">Porciones</label>
                  <input 
                    type="number" 
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-black text-white outline-none"
                    value={newRecipe.portions}
                    onChange={(e) => setNewRecipe({...newRecipe, portions: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-500 uppercase ml-1">PVP ($)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-black text-white outline-none"
                    value={newRecipe.pricePerPortionUSD}
                    onChange={(e) => handlePVPChange(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Bottom Section: Actions Left, Stats Right */}
              <div className="grid grid-cols-2 gap-6">
                {/* Left: Buttons */}
                <div className="flex flex-col gap-2 justify-center">
                  <button 
                    onClick={calculateRecipe}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-2.5 rounded-xl text-[9px] uppercase tracking-widest transition-all"
                  >
                    Calcular
                  </button>
                  <button 
                    onClick={async () => {
                      const cloned: Recipe = { 
                        ...(newRecipe as Recipe), 
                        id: crypto.randomUUID(), 
                        name: `${newRecipe.name} (COPIA)` 
                      };
                      await dbService.put('recipes', cloned);
                      loadData();
                      setShowRecipeModal(false);
                    }}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-xl text-[9px] uppercase tracking-widest transition-all"
                  >
                    Clonar
                  </button>
                  <button 
                    onClick={() => {
                      if (newRecipe.id) handleDeleteRecipe(newRecipe.id);
                    }}
                    className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white font-black rounded-xl text-[9px] uppercase tracking-widest transition-all"
                  >
                    Borrar
                  </button>
                </div>

                {/* Right: 6 Calculations + Save Button */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-slate-500 uppercase">Costo:</span>
                      <span className="text-[11px] font-black text-white">${newRecipe.totalCostUSD?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-slate-500 uppercase">Costo/Por:</span>
                      <span className="text-[11px] font-black text-white">${newRecipe.costPerPortionUSD?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-slate-500 uppercase">Venta:</span>
                      <span className="text-[11px] font-black text-emerald-400">${newRecipe.totalSaleUSD?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-slate-500 uppercase">Gana:</span>
                      <span className="text-[11px] font-black text-white">${newRecipe.totalProfitUSD?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-slate-500 uppercase">Gana/Por:</span>
                      <span className="text-[11px] font-black text-white">${newRecipe.profitPerPortionUSD?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-slate-500 uppercase">PVP:</span>
                      <span className="text-xs font-black text-rose-500">${newRecipe.pricePerPortionUSD?.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleSaveRecipe}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-[9px] uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20"
                  >
                    Guardar Receta
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal?.show && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] border border-slate-700 p-8 rounded-[2.5rem] max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95">
            <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Trash2 size={40} />
            </div>
            <h2 className="text-xl font-black uppercase tracking-tighter mb-4 text-white">{confirmModal.title}</h2>
            <div className="flex gap-4 mt-8">
              <button 
                onClick={() => setConfirmModal(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-black py-4 rounded-2xl transition-all uppercase text-[10px] tracking-widest"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmModal.onConfirm}
                className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-rose-500/20 uppercase text-[10px] tracking-widest"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Manufacturing;
