function removeDuplicatedObject(arr, subKey,) {
    var m = {};
    if (!subKey) subKey = '';
    var newarr = [];
    for (var i = 0; i < arr.length; i++) {
        var v = arr[i];
        if (subKey != '') v = arr[i][subKey];
        if (!m[v]) {
            m[v] = 1;
            newarr.push(arr[i]); // returned array cell    
        } else m[v]++
    }
    for (var i = 0; i < newarr.length; i++) {
        var item = newarr[i];
        newarr[i].duplicatedCnt = m[item[subKey]]
    }
    return newarr;
}

module.exports = {
    removeDuplicatedObject,
}