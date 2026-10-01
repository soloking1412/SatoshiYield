import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "../context/WalletContext.js";
import { useToast } from "../context/ToastContext.js";
import { withdrawalOptions } from "../lib/transactionPolicy.js";
export function useWithdraw() {
  const {callContract,address}=useWallet(); const {show}=useToast(); const qc=useQueryClient();
  return useMutation({mutationFn:async ({adapter,minPayoutSats}:{adapter:string;minPayoutSats?:bigint})=>{
    if(!address) throw new Error("Wallet not connected");
    return callContract({...await withdrawalOptions(address,adapter,"withdraw",minPayoutSats),expectedSender:address});
  },onSuccess:(txid)=>{show({variant:"pending",message:"Withdrawal submitted. Funds are not confirmed until the transaction succeeds.",txid});void qc.invalidateQueries({queryKey:["position",address]});void qc.invalidateQueries({queryKey:["balance",address]});},
  onError:(err:unknown)=>show({variant:"error",message:err instanceof Error?err.message:"Withdrawal failed"})});
}
