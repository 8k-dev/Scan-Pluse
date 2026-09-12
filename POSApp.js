import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Animatable from 'react-native-animatable';

const PRODUCTS_KEY = 'pos_products';
const SALES_KEY = 'pos_sales';
const RECEIPT_KEY = 'pos_receipt_number';

export default function POSApp() {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [view, setView] = useState('register');

  const [productModal, setProductModal] = useState(false);
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [editingProduct, setEditingProduct] = useState(null);

  const [receiptNumber, setReceiptNumber] = useState(1);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [p, s, r] = await Promise.all([
        AsyncStorage.getItem(PRODUCTS_KEY),
        AsyncStorage.getItem(SALES_KEY),
        AsyncStorage.getItem(RECEIPT_KEY),
      ]);
      setProducts(p ? JSON.parse(p) : []);
      setSales(s ? JSON.parse(s) : []);
      setReceiptNumber(r ? parseInt(r) : 1);
    } catch (e) {}
  };

  const persist = async (key, value) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.price.toString().includes(search.toLowerCase())
  );

  const addToCart = (product) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.id === product.id);
      if (idx >= 0) {
        return prev.map((l, i) => (i === idx ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, qty: 1 }];
    });
  };

  const changeQty = (id, delta) => {
    setCart((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0)
    );
  };

  const cartTotal = cart.reduce((sum, l) => sum + l.price * l.qty, 0);
  const cartUnits = cart.reduce((sum, l) => sum + l.qty, 0);

  const openNewProduct = () => {
    setEditingProduct(null);
    setProductName('');
    setProductPrice('');
    setProductModal(true);
  };

  const openEditProduct = (p) => {
    setEditingProduct(p);
    setProductName(p.name);
    setProductPrice(String(p.price));
    setProductModal(true);
  };

  const saveProduct = () => {
    const name = productName.trim();
    const price = parseFloat(productPrice);
    if (!name) return Alert.alert('Missing name', 'Enter a product name.');
    if (isNaN(price) || price < 0) return Alert.alert('Invalid price', 'Enter a valid price.');

    if (editingProduct) {
      const updated = products.map((p) =>
        p.id === editingProduct.id ? { ...p, name, price } : p
      );
      setProducts(updated);
      persist(PRODUCTS_KEY, updated);
    } else {
      const newProduct = { id: Date.now().toString(), name, price };
      const updated = [...products, newProduct];
      setProducts(updated);
      persist(PRODUCTS_KEY, updated);
    }
    setProductModal(false);
  };

  const deleteProduct = (id) => {
    Alert.alert('Delete product', 'Remove this product from the register?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const updated = products.filter((p) => p.id !== id);
          setProducts(updated);
          persist(PRODUCTS_KEY, updated);
        },
      },
    ]);
  };

  const checkout = () => {
    if (!cart.length || checkoutBusy) return;
    setCheckoutBusy(true);
    const now = new Date();
    const receipt = {
      id: receiptNumber,
      date: now.toISOString(),
      lines: cart,
      total: cartTotal,
      units: cartUnits,
    };
    const updatedSales = [...sales, receipt];
    setSales(updatedSales);
    persist(SALES_KEY, updatedSales);
    setReceiptNumber(receiptNumber + 1);
    persist(RECEIPT_KEY, receiptNumber + 1);
    setLastReceipt(receipt);
    setCart([]);
    setShowReceipt(true);
    setCheckoutBusy(false);
  };

  const todaySales = sales.filter((s) => {
    const d = new Date(s.date);
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  });
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const totalItemsSold = sales.reduce((sum, s) => sum + s.units, 0);

  const renderRegister = () => (
    <View style={styles.registerWrap}>
      <TextInput
        style={[styles.searchInput, { outlineStyle: 'none' }]}
        placeholder="Search products..."
        placeholderTextColor="#8e8e93"
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.productList}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No products yet.</Text>
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: 10 }]} onPress={openNewProduct}>
              <Text style={styles.primaryBtnText}>+ Add product</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.productTile} onPress={() => addToCart(item)}>
            <Text style={styles.productTileName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.productTilePrice}>${item.price.toFixed(2)}</Text>
          </TouchableOpacity>
        )}
        numColumns={2}
      />
    </View>
  );

  const renderCart = () => (
    <View style={styles.cartWrap}>
      <FlatList
        data={cart}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.cartList}
        ListEmptyComponent={
          <Text style={styles.cartEmpty}>Tap a product to add it to the sale.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.cartRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cartItemName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.cartItemPrice}>
                ${item.price.toFixed(2)} × {item.qty}
              </Text>
            </View>
            <View style={styles.qtyRow}>
              <TouchableOpacity onPress={() => changeQty(item.id, -1)} style={styles.qtyBtn}>
                <Text style={styles.qtyBtnTextMinus}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.qty}</Text>
              <TouchableOpacity onPress={() => changeQty(item.id, 1)} style={styles.qtyBtn}>
                <Text style={styles.qtyBtnTextPlus}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.cartLineTotal}>${(item.price * item.qty).toFixed(2)}</Text>
          </View>
        )}
      />
      <View style={styles.cartFooter}>
        <View style={styles.cartTotalRow}>
          <Text style={styles.cartTotalLabel}>Total ({cartUnits} items)</Text>
          <Text style={styles.cartTotalValue}>${cartTotal.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.checkoutBtn, !cart.length && styles.checkoutBtnDisabled]}
          onPress={checkout}
          disabled={!cart.length}
        >
          {checkoutBusy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.checkoutBtnText}>Checkout</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderProducts = () => (
    <FlatList
      data={products}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.productsPage}
      ListHeaderComponent={
        <View style={styles.productsHeader}>
          <Text style={styles.pageTitle}>Products</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openNewProduct}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      }
      ListEmptyComponent={<Text style={styles.cartEmpty}>No products yet. Add your first one.</Text>}
      renderItem={({ item }) => (
        <View style={styles.productRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cartItemName}>{item.name}</Text>
            <Text style={styles.cartItemPrice}>${item.price.toFixed(2)}</Text>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => openEditProduct(item)}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editBtn} onPress={() => deleteProduct(item.id)}>
            <Text style={[styles.editBtnText, { color: '#ff453a' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    />
  );

  const renderReports = () => (
    <ScrollView contentContainerStyle={styles.reportsPage}>
      <Text style={styles.pageTitle}>Reports</Text>
      <Animatable.View animation="fadeInUp" style={styles.statCard}>
        <Text style={styles.statLabel}>Today's revenue</Text>
        <Text style={styles.statValue}>${todayRevenue.toFixed(2)}</Text>
      </Animatable.View>
      <Animatable.View animation="fadeInUp" delay={60} style={styles.statCard}>
        <Text style={styles.statLabel}>Total revenue</Text>
        <Text style={styles.statValue}>${totalRevenue.toFixed(2)}</Text>
      </Animatable.View>
      <Animatable.View animation="fadeInUp" delay={120} style={styles.statCard}>
        <Text style={styles.statLabel}>Items sold</Text>
        <Text style={styles.statValue}>{totalItemsSold}</Text>
      </Animatable.View>
      <Text style={styles.sectionTitle}>Sales history</Text>
      {sales.length === 0 ? (
        <Text style={styles.cartEmpty}>No sales recorded yet.</Text>
      ) : (
        sales
          .slice()
          .reverse()
          .map((s) => (
            <Animatable.View key={s.id} animation="fadeInUp" style={styles.saleCard}>
              <View style={styles.saleHeader}>
                <Text style={styles.saleReceipt}>Receipt #{s.id}</Text>
                <Text style={styles.saleDate}>
                  {new Date(s.date).toLocaleDateString()} {new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              {s.lines.map((l) => (
                <Text key={l.id} style={styles.saleLine}>
                  {l.qty} × {l.name} — ${(l.price * l.qty).toFixed(2)}
                </Text>
              ))}
              <View style={styles.saleFooter}>
                <Text style={styles.saleTotal}>Total: ${s.total.toFixed(2)}</Text>
              </View>
            </Animatable.View>
          ))
      )}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Product add/edit modal */}
      <Modal visible={productModal} animationType="fade" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Animatable.View animation="zoomIn" duration={250} style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingProduct ? 'Edit product' : 'New product'}
            </Text>
            <TextInput
              style={[styles.input, { outlineStyle: 'none' }]}
              placeholder="Product name"
              placeholderTextColor="#8e8e93"
              value={productName}
              onChangeText={setProductName}
              autoFocus
            />
            <TextInput
              style={[styles.input, { outlineStyle: 'none' }]}
              placeholder="Price ($)"
              placeholderTextColor="#8e8e93"
              value={productPrice}
              onChangeText={setProductPrice}
              keyboardType="decimal-pad"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setProductModal(false)}
              >
                <Text style={styles.modalBtnTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSave]}
                onPress={saveProduct}
              >
                <Text style={styles.modalBtnTextSave}>{editingProduct ? 'Save' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </Animatable.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Receipt modal */}
      <Modal visible={showReceipt} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <Animatable.View animation="zoomIn" duration={250} style={styles.receiptCard}>
            <Text style={styles.receiptTitle}>Receipt #{lastReceipt?.id}</Text>
            <Text style={styles.receiptDate}>
              {lastReceipt ? new Date(lastReceipt.date).toLocaleString() : ''}
            </Text>
            <View style={styles.receiptDivider} />
            {lastReceipt?.lines.map((l) => (
              <View key={l.id} style={styles.receiptLine}>
                <Text style={styles.receiptLineText}>{l.name}</Text>
                <Text style={styles.receiptLineText}>
                  ${l.price.toFixed(2)} × {l.qty}
                </Text>
              </View>
            ))}
            <View style={styles.receiptDivider} />
            <View style={styles.receiptLine}>
              <Text style={styles.receiptTotal}>Total</Text>
              <Text style={styles.receiptTotal}>${lastReceipt?.total.toFixed(2)}</Text>
            </View>
            <Text style={styles.receiptThanks}>Thank you!</Text>
            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave, { width: '100%' }]} onPress={() => setShowReceipt(false)}>
              <Text style={styles.modalBtnTextSave}>Done</Text>
            </TouchableOpacity>
          </Animatable.View>
        </View>
      </Modal>

      <View style={styles.content}>
        {view === 'register' && (
          <View style={styles.splitLayout}>
            <View style={styles.leftPane}>{renderRegister()}</View>
            <View style={styles.rightPane}>{renderCart()}</View>
          </View>
        )}
        {view === 'products' && renderProducts()}
        {view === 'reports' && renderReports()}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabButton} onPress={() => setView('register')}>
          <Text style={[styles.tabText, view === 'register' && styles.tabTextActive]}>💵 Register</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabButton} onPress={() => setView('products')}>
          <Text style={[styles.tabText, view === 'products' && styles.tabTextActive]}>📦 Products</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabButton} onPress={() => setView('reports')}>
          <Text style={[styles.tabText, view === 'reports' && styles.tabTextActive]}>📈 Reports</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  content: { flex: 1 },
  splitLayout: { flex: 1, flexDirection: 'row' },
  leftPane: { flex: 3, padding: 12 },
  rightPane: { flex: 2, backgroundColor: 'rgba(255,255,255,0.03)', borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.08)' },
  searchInput: {
    height: 44,
    backgroundColor: '#0d1420',
    borderColor: '#1f2937',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    color: '#ffffff',
    marginBottom: 12,
  },
  productList: { paddingBottom: 20 },
  productTile: {
    flex: 1,
    margin: 5,
    padding: 16,
    backgroundColor: '#111a2c',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'space-between',
    minHeight: 88,
  },
  productTileName: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  productTilePrice: { color: '#3a86ff', fontSize: 16, fontWeight: '800', marginTop: 8 },
  emptyBox: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#8e8e93', fontSize: 15 },
  cartWrap: { flex: 1 },
  cartList: { padding: 16, flexGrow: 1 },
  cartEmpty: { color: '#8e8e93', textAlign: 'center', marginTop: 40 },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  cartItemName: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  cartItemPrice: { color: '#8e8e93', fontSize: 12, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnTextMinus: { color: '#ff453a', fontWeight: '800', fontSize: 16 },
  qtyBtnTextPlus: { color: '#30d158', fontWeight: '800', fontSize: 16 },
  qtyText: { color: '#ffffff', fontWeight: '700', width: 26, textAlign: 'center' },
  cartLineTotal: { color: '#ffffff', fontWeight: '700', width: 60, textAlign: 'right' },
  cartFooter: { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  cartTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cartTotalLabel: { color: '#8e8e93', fontSize: 14 },
  cartTotalValue: { color: '#ffffff', fontSize: 22, fontWeight: '900' },
  checkoutBtn: {
    backgroundColor: '#10b981',
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutBtnDisabled: { opacity: 0.4 },
  checkoutBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 16 },
  productsPage: { padding: 20 },
  productsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageTitle: { color: '#ffffff', fontSize: 24, fontWeight: '800', marginBottom: 16 },
  addBtn: {
    backgroundColor: '#3a86ff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  addBtnText: { color: '#ffffff', fontWeight: '700' },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111a2c',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  editBtn: { marginLeft: 12 },
  editBtnText: { color: '#60a5fa', fontWeight: '700', fontSize: 13 },
  reportsPage: { padding: 20 },
  statCard: {
    backgroundColor: '#111a2c',
    padding: 18,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statLabel: { color: '#8e8e93', fontSize: 13 },
  statValue: { color: '#30d158', fontSize: 28, fontWeight: '900', marginTop: 4 },
  sectionTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  saleCard: {
    backgroundColor: '#111a2c',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  saleHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  saleReceipt: { color: '#ffffff', fontWeight: '700' },
  saleDate: { color: '#8e8e93', fontSize: 12 },
  saleLine: { color: '#d1d1d6', fontSize: 13, marginVertical: 1 },
  saleFooter: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', marginTop: 8, paddingTop: 6 },
  saleTotal: { color: '#ffffff', fontWeight: '800', textAlign: 'right' },
  tabBar: {
    flexDirection: 'row',
    height: 70,
    backgroundColor: 'rgba(10,10,12,0.95)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 10,
  },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabText: { color: '#8e8e93', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#3a86ff', fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#111a2c',
    borderRadius: 18,
    padding: 20,
  },
  receiptCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 24,
  },
  modalTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  input: {
    height: 48,
    backgroundColor: '#0d1420',
    borderColor: '#1f2937',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    color: '#ffffff',
    marginBottom: 12,
  },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: 'rgba(255,255,255,0.08)' },
  modalBtnSave: { backgroundColor: '#3a86ff' },
  modalBtnTextCancel: { color: '#ff453a', fontWeight: '700' },
  modalBtnTextSave: { color: '#ffffff', fontWeight: '700' },
  receiptTitle: { fontSize: 22, fontWeight: '900', color: '#000', textAlign: 'center' },
  receiptDate: { fontSize: 12, color: '#6e6e73', textAlign: 'center', marginTop: 4 },
  receiptDivider: { height: 1, backgroundColor: '#e5e5ea', marginVertical: 14 },
  receiptLine: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  receiptLineText: { color: '#000', fontSize: 14 },
  receiptTotal: { color: '#000', fontSize: 16, fontWeight: '800' },
  receiptThanks: { textAlign: 'center', color: '#3a86ff', fontWeight: '700', marginVertical: 12 },
});
